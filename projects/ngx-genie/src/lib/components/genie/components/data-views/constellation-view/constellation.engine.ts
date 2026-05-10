import {NgZone} from '@angular/core';
import {
  CONSTELLATION_THEME,
  ConstellationGraphStats,
  ConstellationLinkRenderMode,
  LinkAnimState,
  RenderLink,
  RenderNode
} from './constellation.models';
import {constellationWorkerBody} from './constellation.worker';

interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const ATLAS_SPATIAL_CELL_SIZE = 720;
const ATLAS_MAX_DRAWN_NODES = 9000;
const ATLAS_MAX_SPATIAL_CELLS_PER_FRAME = 25000;

export class ConstellationEngine {
  private readonly _ctx: CanvasRenderingContext2D;
  private _worker: Worker | null = null;
  private _workerObjUrl: string | null = null;
  private _animationFrameId: number = 0;
  private _destroyed = false;

  private _renderNodes = new Map<string, RenderNode>();
  private _renderLinks: RenderLink[] = [];
  private _providerLinks: RenderLink[] = [];
  private _dependencyLinks: RenderLink[] = [];
  private _componentLinks: RenderLink[] = [];
  private _linksByNodeId = new Map<string, RenderLink[]>();
  private _dependencyDegreeByNodeId = new Map<string, number>();
  private _nodeSpatialIndex = new Map<string, RenderNode[]>();
  private _graphStats: ConstellationGraphStats | null = null;
  private _linkAnimStates = new Map<string, LinkAnimState>();

  private _width = 800;
  private _height = 600;
  private _dpiScale = 1;
  private _viewTransform = {x: 0, y: 0, k: 1};

  private _focusedNodeIds = new Set<string>();
  private _currentFocusLevel = 0;
  private _physicsTickPending = false;
  private _lastPhysicsTickAt = 0;
  private _renderDirty = true;


  private _unusedPattern: CanvasPattern | null = null;

  animationsEnabled = true;
  focusModeEnabled = true;
  linkRenderMode: ConstellationLinkRenderMode = 'adaptive';
  isPaused = false;
  hoveredNode: RenderNode | null = null;
  pinnedNode: RenderNode | null = null;

  constructor(
    private readonly _canvas: HTMLCanvasElement,
    private readonly _zone: NgZone,
    private readonly _onTickPositionsUpdate: (positions: { id: string, x: number, y: number }[]) => void
  ) {
    this._ctx = this._canvas.getContext('2d', {alpha: false}) as CanvasRenderingContext2D;
    this._initWorker();
    this._createUnusedPattern();
  }

  start() {
    this._zone.runOutsideAngular(() => {
      const loop = () => {
        if (this._destroyed) return;
        const now = performance.now();
        if (this._worker && !this.isPaused && this._canDispatchPhysicsTick(now)) {
          this._physicsTickPending = true;
          this._lastPhysicsTickAt = now;
          this._worker.postMessage({type: 'TICK'});
        }
        if (this._shouldRenderFrame()) {
          this._renderFrame();
          if (this._isStaticLayout()) this._renderDirty = false;
        }
        this._animationFrameId = requestAnimationFrame(loop);
      };
      loop();
    });
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._animationFrameId);
    if (this._worker) this._worker.terminate();
    if (this._workerObjUrl) URL.revokeObjectURL(this._workerObjUrl);
  }

  resize(width: number, height: number, dpi: number) {
    this._width = width;
    this._height = height;
    this._dpiScale = dpi;
    this._canvas.width = width * dpi;
    this._canvas.height = height * dpi;
    this._renderDirty = true;

    this._createUnusedPattern();

    if (this._worker) {
      this._worker.postMessage({type: 'RESIZE', payload: {width, height}});
    }
  }

  updateGraphData(
    nodes: any[],
    links: any[],
    renderNodes: Map<string, RenderNode>,
    renderLinks: RenderLink[],
    stats?: ConstellationGraphStats
  ) {
    this._renderNodes = renderNodes;
    this._renderLinks = renderLinks;
    this._graphStats = stats ?? null;
    this._rebuildLinkIndexes(renderLinks);
    this._rebuildNodeSpatialIndex();
    if (this.hoveredNode) this.hoveredNode = this._renderNodes.get(this.hoveredNode.id) ?? null;
    if (this.pinnedNode) this.pinnedNode = this._renderNodes.get(this.pinnedNode.id) ?? null;
    this._updateFocusSet(this._getActiveFocusNode());
    this._physicsTickPending = false;
    this._renderDirty = true;

    if (renderLinks.length > this._getAnimatedLinkLimit()) {
      this._linkAnimStates.clear();
    } else {
      const currentLinkIds = new Set(renderLinks.map(l => l.uniqueId));
      for (const id of this._linkAnimStates.keys()) {
        if (!currentLinkIds.has(id)) this._linkAnimStates.delete(id);
      }
    }

    if (this._worker) {
      this._worker.postMessage({
        type: 'UPDATE_DATA',
        payload: {nodes, links}
      });
    }
  }

  updatePositions(positions: { id: string, x: number, y: number }[]) {
    for (const pos of positions) {
      const node = this._renderNodes.get(pos.id);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
    this._renderDirty = true;
  }

  updateTransform(transform: { x: number, y: number, k: number }) {
    this._viewTransform = transform;
    this._renderDirty = true;
  }

  getViewTransform() {
    return {...this._viewTransform};
  }

  updatePhysics(repulsion: number) {
    if (this._worker) {
      this._worker.postMessage({
        type: 'UPDATE_PHYSICS',
        payload: {repulsion}
      });
    }
  }

  setLinkRenderMode(mode: ConstellationLinkRenderMode) {
    this.linkRenderMode = mode;
    this._renderDirty = true;
  }

  setPinnedNode(node: RenderNode | null) {
    this.pinnedNode = node;
    this._updateFocusSet(this._getActiveFocusNode());
    this._renderDirty = true;
  }

  requestRender() {
    this._renderDirty = true;
  }

  resetEntropy() {
    if (this._isStaticLayout()) return;
    if (this._worker) this._worker.postMessage({type: 'RESET_ENTROPY'});
  }

  get renderNodes(): Map<string, RenderNode> {
    return this._renderNodes;
  }

  getRenderNodes(): Map<string, RenderNode> {
    return this.renderNodes;
  }

  get renderLinks(): RenderLink[] {
    return this._renderLinks;
  }

  getHitNode(clientX: number, clientY: number, rect: DOMRect): RenderNode | null {
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const {x: tx, y: ty, k: zoom} = this._viewTransform;
    const worldX = (mouseX - tx) / zoom;
    const worldY = (mouseY - ty) / zoom;

    let bestNode: RenderNode | null = null;
    const hitRadius = 20 / zoom;
    let minDistSq = hitRadius * hitRadius;
    const candidates = this._getHitTestCandidates(worldX, worldY);

    for (const node of candidates) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestNode = node;
      }
    }
    return bestNode;
  }

  setHoveredNode(node: RenderNode | null) {
    this.hoveredNode = node;
    this._updateFocusSet(this._getActiveFocusNode());
    this._renderDirty = true;
  }

  private _getActiveFocusNode(): RenderNode | null {
    return this.hoveredNode ?? this.pinnedNode;
  }

  private _isStaticLayout(): boolean {
    return this._graphStats?.layoutMode === 'atlas' || this._graphStats?.layoutMode === 'organic';
  }

  private _initWorker() {
    if (typeof Worker !== 'undefined') {
      try {
        const workerCode = `(${constellationWorkerBody.toString()})()`;
        const blob = new Blob([workerCode], {type: 'application/javascript'});
        this._workerObjUrl = URL.createObjectURL(blob);
        this._worker = new Worker(this._workerObjUrl);
        this._worker.onmessage = ({data}) => {
          if (data.type === 'TICK_RESULT') {
            this._physicsTickPending = false;
            this._onTickPositionsUpdate(data.positions);
          }
        };
        this._worker.onerror = () => {
          this._physicsTickPending = false;
        };
      } catch (e) {
        console.error('[Engine] Worker init failed', e);
      }
    }
  }

  private _createUnusedPattern() {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(10, 0);
      ctx.stroke();
      this._unusedPattern = this._ctx.createPattern(canvas, 'repeat');
    }
  }

  private _rebuildLinkIndexes(renderLinks: RenderLink[]) {
    this._providerLinks = [];
    this._dependencyLinks = [];
    this._componentLinks = [];
    this._linksByNodeId = new Map<string, RenderLink[]>();
    this._dependencyDegreeByNodeId = new Map<string, number>();

    for (const link of renderLinks) {
      if (link.type === 'provider') this._providerLinks.push(link);
      else if (link.type === 'dependency') this._dependencyLinks.push(link);
      else this._componentLinks.push(link);

      this._addIndexedLink(link.sourceId, link);
      this._addIndexedLink(link.targetId, link);

      if (link.type === 'dependency') {
        this._dependencyDegreeByNodeId.set(link.sourceId, (this._dependencyDegreeByNodeId.get(link.sourceId) ?? 0) + 1);
        this._dependencyDegreeByNodeId.set(link.targetId, (this._dependencyDegreeByNodeId.get(link.targetId) ?? 0) + 1);
      }
    }
  }

  private _addIndexedLink(nodeId: string, link: RenderLink): void {
    const links = this._linksByNodeId.get(nodeId);
    if (links) {
      links.push(link);
    } else {
      this._linksByNodeId.set(nodeId, [link]);
    }
  }

  private _rebuildNodeSpatialIndex(): void {
    this._nodeSpatialIndex.clear();
    if (!this._isStaticLayout()) return;

    for (const node of this._renderNodes.values()) {
      const key = this._spatialKeyForPoint(node.x, node.y);
      const bucket = this._nodeSpatialIndex.get(key);
      if (bucket) {
        bucket.push(node);
      } else {
        this._nodeSpatialIndex.set(key, [node]);
      }
    }
  }

  private _spatialKeyForPoint(x: number, y: number): string {
    return `${Math.floor(x / ATLAS_SPATIAL_CELL_SIZE)}:${Math.floor(y / ATLAS_SPATIAL_CELL_SIZE)}`;
  }

  private _getHitTestCandidates(worldX: number, worldY: number): Iterable<RenderNode> {
    if (!this._isStaticLayout()) return this._renderNodes.values();

    const cellX = Math.floor(worldX / ATLAS_SPATIAL_CELL_SIZE);
    const cellY = Math.floor(worldY / ATLAS_SPATIAL_CELL_SIZE);
    const candidates: RenderNode[] = [];

    for (let x = cellX - 1; x <= cellX + 1; x++) {
      for (let y = cellY - 1; y <= cellY + 1; y++) {
        const bucket = this._nodeSpatialIndex.get(`${x}:${y}`);
        if (bucket) candidates.push(...bucket);
      }
    }

    return candidates;
  }

  private _getRenderableNodes(bounds: ViewBounds, zoom: number): RenderNode[] {
    if (!this._isStaticLayout()) {
      const nodes: RenderNode[] = [];
      for (const node of this._renderNodes.values()) {
        if (this._isNodeInBounds(node, bounds, zoom)) nodes.push(node);
      }
      return nodes;
    }

    const minCellX = Math.floor(bounds.left / ATLAS_SPATIAL_CELL_SIZE);
    const maxCellX = Math.floor(bounds.right / ATLAS_SPATIAL_CELL_SIZE);
    const minCellY = Math.floor(bounds.top / ATLAS_SPATIAL_CELL_SIZE);
    const maxCellY = Math.floor(bounds.bottom / ATLAS_SPATIAL_CELL_SIZE);
    const nodes: RenderNode[] = [];
    const collectLimit = zoom < 0.72 ? ATLAS_MAX_DRAWN_NODES * 2 : ATLAS_MAX_DRAWN_NODES;
    const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
    if (cellCount > ATLAS_MAX_SPATIAL_CELLS_PER_FRAME) {
      return this._scanRenderableNodes(bounds, zoom, collectLimit);
    }

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        const bucket = this._nodeSpatialIndex.get(`${x}:${y}`);
        if (!bucket) continue;

        for (const node of bucket) {
          if (!this._isNodeInBounds(node, bounds, zoom)) continue;
          if (!this._passesAtlasNodeLod(node, zoom)) continue;
          nodes.push(node);
          if (nodes.length >= collectLimit) return this._finalizeRenderableNodes(nodes, zoom);
        }
      }
    }

    return this._finalizeRenderableNodes(nodes, zoom);
  }

  private _scanRenderableNodes(bounds: ViewBounds, zoom: number, collectLimit: number): RenderNode[] {
    const nodes: RenderNode[] = [];

    for (const node of this._renderNodes.values()) {
      if (!this._isNodeInBounds(node, bounds, zoom)) continue;
      if (!this._passesAtlasNodeLod(node, zoom)) continue;
      nodes.push(node);
      if (zoom >= 0.72 && nodes.length >= collectLimit) break;
    }

    return this._finalizeRenderableNodes(nodes, zoom);
  }

  private _finalizeRenderableNodes(nodes: RenderNode[], zoom: number): RenderNode[] {
    if (zoom < 0.72) {
      nodes.sort((a, b) => this._getNodeImportance(a) - this._getNodeImportance(b));
      if (nodes.length > ATLAS_MAX_DRAWN_NODES) return nodes.slice(nodes.length - ATLAS_MAX_DRAWN_NODES);
    }

    return nodes;
  }

  private _passesAtlasNodeLod(node: RenderNode, zoom: number): boolean {
    if (node.type === 'injector') return true;
    if (this.hoveredNode?.id === node.id || this.pinnedNode?.id === node.id) return true;
    if (this._focusedNodeIds.has(node.id)) return true;
    if (zoom >= 0.7) return true;

    const degree = this._dependencyDegreeByNodeId.get(node.id) ?? 0;
    const importance = this._getNodeImportance(node);
    if (zoom < 0.28) return importance >= 0.84 || degree >= 34;
    if (zoom < 0.45) return importance >= 0.70 || degree >= 18;
    if (importance >= 0.55) return true;
    if (zoom >= 0.45 && degree >= 8) return true;
    return false;
  }

  private _updateFocusSet(node: RenderNode | null) {
    this._focusedNodeIds.clear();
    if (!node) return;
    this._focusedNodeIds.add(node.id);
    for (const link of this._linksByNodeId.get(node.id) ?? []) {
      if (link.sourceId === node.id) this._focusedNodeIds.add(link.targetId);
      if (link.targetId === node.id) this._focusedNodeIds.add(link.sourceId);
    }
  }

  private _lerp(start: number, end: number, t: number): number {
    return start * (1 - t) + end * t;
  }

  private _shouldRenderFrame(): boolean {
    if (!this._isStaticLayout()) return true;
    return this._renderDirty;
  }

  private _shouldAnimateVisuals(): boolean {
    return this.animationsEnabled && !this._isStaticLayout();
  }

  private _canDispatchPhysicsTick(now: number): boolean {
    if (this._isStaticLayout()) return false;
    if (this._physicsTickPending) return false;
    const interval = this._getPhysicsTickInterval();
    return now - this._lastPhysicsTickAt >= interval;
  }

  private _getPhysicsTickInterval(): number {
    const count = this._renderNodes.size;
    if (this._isHugeGraph()) return 220;
    if (count > 6000) return 120;
    if (count > 3000) return 80;
    if (count > 1200) return 48;
    if (count > 500) return 32;
    return 16;
  }

  private _getAnimatedLinkLimit(): number {
    if (this._isHugeGraph()) return 0;
    return 2000;
  }

  private _shouldRenderLabels(zoom: number, minZoom: number): boolean {
    const count = this._renderNodes.size;
    if (this._isHugeGraph()) return zoom > minZoom + 1.45;
    if (count > 3000) return zoom > minZoom + 1.1;
    if (count > 1000) return zoom > minZoom + 0.55;
    return zoom > minZoom;
  }

  private _shouldRenderOverviewLabel(node: RenderNode, zoom: number): boolean {
    if (zoom > 0.34) return false;
    if (node.meta?.isRoot) return true;

    const importance = this._getNodeImportance(node);
    if (node.type === 'injector') return importance >= 0.92;
    return importance >= 0.97;
  }

  private _isHugeGraph(): boolean {
    return this._isStaticLayout()
      || !!this._graphStats?.isHuge
      || this._renderNodes.size > 3500
      || this._renderLinks.length > 12000;
  }

  private _getViewBounds(tx: number, ty: number, zoom: number, width: number, height: number): ViewBounds {
    const safeZoom = Math.max(zoom, 0.0005);
    const margin = 120 / safeZoom;
    return {
      left: (-tx / safeZoom) - margin,
      right: ((width - tx) / safeZoom) + margin,
      top: (-ty / safeZoom) - margin,
      bottom: ((height - ty) / safeZoom) + margin
    };
  }

  private _isNodeInBounds(node: RenderNode, bounds: ViewBounds, zoom: number): boolean {
    const radius = this._getVisualRadius(node, zoom) + 40 / Math.max(zoom, 0.2);
    return node.x + radius >= bounds.left
      && node.x - radius <= bounds.right
      && node.y + radius >= bounds.top
      && node.y - radius <= bounds.bottom;
  }

  private _isLinkInBounds(source: RenderNode, target: RenderNode, bounds: ViewBounds): boolean {
    return Math.max(source.x, target.x) >= bounds.left
      && Math.min(source.x, target.x) <= bounds.right
      && Math.max(source.y, target.y) >= bounds.top
      && Math.min(source.y, target.y) <= bounds.bottom;
  }

  private _renderFrame() {
    if (!this._ctx) return;
    const _ctx = this._ctx;
    const {_width, _height} = this;
    const time = performance.now();
    const dpi = this._dpiScale;

    _ctx.setTransform(1, 0, 0, 1, 0, 0);
    _ctx.fillStyle = CONSTELLATION_THEME.bg;
    _ctx.fillRect(0, 0, _width * dpi, _height * dpi);

    _ctx.scale(dpi, dpi);
    const {x: tx, y: ty, k: zoom} = this._viewTransform;
    const bounds = this._getViewBounds(tx, ty, zoom, _width, _height);

    this._drawGrid(_ctx, _width, _height, tx, ty, zoom);

    _ctx.translate(tx, ty);
    _ctx.scale(zoom, zoom);

    const activeFocusNode = this._getActiveFocusNode();
    const targetFocusLevel = (this.focusModeEnabled && activeFocusNode) ? 1.0 : 0.0;
    this._currentFocusLevel = this._isStaticLayout()
      ? targetFocusLevel
      : this._lerp(this._currentFocusLevel, targetFocusLevel, 0.05);
    if (this._currentFocusLevel < 0.001) this._currentFocusLevel = 0;
    const isFocusActive = this._currentFocusLevel > 0.01;
    const renderableNodes = this._getRenderableNodes(bounds, zoom);

    _ctx.lineCap = 'round';
    this._drawLinksForFrame(_ctx, zoom, isFocusActive, time, bounds, activeFocusNode);
    this._drawDependencyDensity(_ctx, zoom, bounds, isFocusActive, renderableNodes);

    for (const node of renderableNodes) {
      this._drawNode(_ctx, node, zoom, isFocusActive, time);
    }
  }

  private _drawLinksForFrame(
    _ctx: CanvasRenderingContext2D,
    zoom: number,
    isFocusActive: boolean,
    time: number,
    bounds: ViewBounds,
    activeFocusNode: RenderNode | null
  ) {
    if (!this._isHugeGraph()) {
      this._drawLinkBatch(_ctx, this._renderLinks, zoom, isFocusActive, time, bounds, Number.POSITIVE_INFINITY);
      return;
    }

    if (this.linkRenderMode === 'all') {
      this._drawLinkBatch(_ctx, this._componentLinks, zoom, isFocusActive, time, bounds, zoom > 1.1 ? 10000 : 3500);
      this._drawLinkBatch(_ctx, this._providerLinks, zoom, isFocusActive, time, bounds, zoom > 1.1 ? 12000 : 4500);
      this._drawLinkBatch(_ctx, this._dependencyLinks, zoom, isFocusActive, time, bounds, zoom > 1.8 ? 14000 : 6000);
      return;
    }

    const structuralCap = zoom > 1.1 ? 7000 : 2600;
    this._drawLinkBatch(_ctx, this._componentLinks, zoom, isFocusActive, time, bounds, structuralCap);

    if (this.linkRenderMode !== 'focused' && zoom > 0.45) {
      this._drawLinkBatch(_ctx, this._providerLinks, zoom, isFocusActive, time, bounds, zoom > 1.2 ? 6500 : 1800);
    }

    if (activeFocusNode) {
      const focusedLinks = this._linksByNodeId.get(activeFocusNode.id) ?? [];
      this._drawLinkBatch(_ctx, focusedLinks, zoom, isFocusActive, time, bounds, zoom > 1.5 ? 4000 : 1800);
      return;
    }

    if (this.linkRenderMode === 'adaptive' && zoom > 2.2) {
      this._drawLinkBatch(_ctx, this._dependencyLinks, zoom, isFocusActive, time, bounds, this._getAdaptiveDependencyLinkCap(zoom));
    }
  }

  private _drawLinkBatch(
    _ctx: CanvasRenderingContext2D,
    links: RenderLink[],
    zoom: number,
    isFocusActive: boolean,
    time: number,
    bounds: ViewBounds,
    limit: number
  ) {
    let drawn = 0;
    let checked = 0;
    const maxChecked = Number.isFinite(limit) ? Math.max(3000, limit * 14) : Number.POSITIVE_INFINITY;
    for (const link of links) {
      if (drawn >= limit) return;
      if (checked >= maxChecked) return;
      checked++;
      if (this._drawLink(_ctx, link, zoom, isFocusActive, time, bounds)) {
        drawn++;
      }
    }
  }

  private _getAdaptiveDependencyLinkCap(zoom: number): number {
    if (zoom > 3.5) return 6000;
    if (zoom > 2.8) return 4200;
    return 2400;
  }

  private _drawDependencyDensity(
    _ctx: CanvasRenderingContext2D,
    zoom: number,
    bounds: ViewBounds,
    isFocusActive: boolean,
    renderableNodes: RenderNode[]
  ) {
    if (!this._isHugeGraph() || this.linkRenderMode === 'all' || zoom > 2.5) return;

    _ctx.save();
    _ctx.setLineDash([]);
    for (const node of renderableNodes) {
      const degree = this._dependencyDegreeByNodeId.get(node.id) ?? 0;
      if (degree < 4) continue;

      const intensity = Math.min(1, Math.log2(degree + 1) / 12);
      const radius = node.radius + 8 + intensity * 24;
      const alpha = (isFocusActive ? 0.06 : 0.12) * intensity;

      _ctx.beginPath();
      _ctx.arc(node.x, node.y, radius / Math.max(zoom, 0.35), 0, Math.PI * 2);
      _ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      _ctx.lineWidth = Math.max(0.6, 1.4 / zoom);
      _ctx.stroke();
    }
    _ctx.restore();
  }

  private _drawLink(_ctx: CanvasRenderingContext2D, link: RenderLink, zoom: number, isFocusActive: boolean, time: number, bounds: ViewBounds): boolean {
    const source = this._renderNodes.get(link.sourceId);
    const target = this._renderNodes.get(link.targetId);
    if (!source || !target) return false;
    if (!this._isLinkInBounds(source, target, bounds)) return false;

    let linkOpacity = 0.6;
    if (isFocusActive) {
      const activeFocusNode = this._getActiveFocusNode();
      const isRelated = activeFocusNode && (link.sourceId === activeFocusNode.id || link.targetId === activeFocusNode.id);
      if (!isRelated) linkOpacity = this._lerp(1.0, 0.05, this._currentFocusLevel);
    }

    _ctx.globalAlpha = linkOpacity;

    if (link.type === 'provider') {
      const isUnused = target.meta?.isUnused;
      _ctx.beginPath();
      _ctx.moveTo(source.x, source.y);
      _ctx.lineTo(target.x, target.y);
      _ctx.strokeStyle = isUnused ? 'rgba(100, 116, 139, 0.3)' : CONSTELLATION_THEME.links.base;
      if (isUnused) _ctx.setLineDash([4, 4]);
      else _ctx.setLineDash([1, 4]);
      _ctx.lineWidth = 1 / zoom;
      _ctx.stroke();
      _ctx.setLineDash([]);
    } else if (link.type === 'component-child') {
      _ctx.beginPath();
      _ctx.moveTo(source.x, source.y);
      _ctx.lineTo(target.x, target.y);
      _ctx.strokeStyle = CONSTELLATION_THEME.injector.color;
      _ctx.lineWidth = 0.8 / zoom;
      _ctx.stroke();
    } else {
      const isUnused = target.meta?.isUnused;
      if (isUnused) {
        _ctx.beginPath();
        _ctx.moveTo(source.x, source.y);
        _ctx.lineTo(target.x, target.y);
        _ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        _ctx.setLineDash([30, 20]);
        _ctx.lineWidth = 1.5 / zoom;
        _ctx.stroke();
        _ctx.setLineDash([]);
      } else {
        const color = target.glowColor || '#fff';
        _ctx.beginPath();
        _ctx.moveTo(source.x, source.y);
        _ctx.lineTo(target.x, target.y);
        _ctx.strokeStyle = color;
        _ctx.globalAlpha = linkOpacity * 0.15;
        _ctx.lineWidth = 2 / zoom;
        _ctx.stroke();

        if (this._shouldAnimateVisuals() && this._renderLinks.length <= this._getAnimatedLinkLimit() && linkOpacity > 0.3) {
          _ctx.globalAlpha = linkOpacity;
          this._drawEnergy(_ctx, link, source, target, color, time, zoom);
        }
      }
    }
    _ctx.globalAlpha = 1.0;
    return true;
  }

  private _drawEnergy(_ctx: CanvasRenderingContext2D, link: RenderLink, source: RenderNode, target: RenderNode, color: string, time: number, zoom: number) {
    let anim = this._linkAnimStates.get(link.uniqueId);
    if (!anim) {
      anim = {
        state: 'IDLE',
        stateStartTime: time,
        duration: Math.random() * 2000,
        currentSpeed: 0,
        currentLength: 0
      };
      this._linkAnimStates.set(link.uniqueId, anim);
    }

    const elapsed = time - anim.stateStartTime;
    const dist = Math.hypot(target.x - source.x, target.y - source.y);

    if (elapsed > anim.duration) {
      if (anim.state === 'IDLE') {
        anim.state = 'SHOOTING';
        anim.stateStartTime = time;
        const baseSpeed = 150 + Math.random() * 300;
        const distFactor = Math.min(1.0, Math.max(0.4, dist / 200));
        anim.currentSpeed = baseSpeed * distFactor;
        anim.duration = (dist / anim.currentSpeed) * 1000;
        anim.currentLength = 50 + Math.random() * (Math.min(150, dist * 0.8) - 50);
      } else {
        anim.state = 'IDLE';
        anim.stateStartTime = time;
        anim.duration = 1000 + Math.random() * 2000;
      }
    }

    if (anim.state === 'SHOOTING') {
      const t = (time - anim.stateStartTime) / anim.duration;
      const headDist = t * dist;
      const tailDist = headDist - anim.currentLength;

      if (tailDist < dist && headDist > 0) {
        const visibleStart = Math.max(0, tailDist);
        const visibleEnd = Math.min(dist, headDist);
        if (visibleStart < visibleEnd) {
          const tStart = visibleStart / dist;
          const tEnd = visibleEnd / dist;

          const startX = source.x + (target.x - source.x) * tStart;
          const startY = source.y + (target.y - source.y) * tStart;
          const endX = source.x + (target.x - source.x) * tEnd;
          const endY = source.y + (target.y - source.y) * tEnd;

          const grad = _ctx.createLinearGradient(startX, startY, endX, endY);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.5, color);
          grad.addColorStop(1, '#fff');

          _ctx.beginPath();
          _ctx.moveTo(startX, startY);
          _ctx.lineTo(endX, endY);
          _ctx.strokeStyle = grad;
          _ctx.lineWidth = 2.0 / zoom;
          _ctx.shadowBlur = 8;
          _ctx.shadowColor = color;
          _ctx.stroke();
          _ctx.shadowBlur = 0;
        }
      }
    }
  }

  private _getNodeImportance(node: RenderNode): number {
    if (node.meta?.isRoot) return 1;
    const explicitImportance = node.meta?.importance;
    if (typeof explicitImportance === 'number') return Math.max(0, Math.min(1, explicitImportance));

    const degree = this._dependencyDegreeByNodeId.get(node.id) ?? 0;
    return Math.max(0.08, Math.min(1, Math.log2(degree + 1) / 8));
  }

  private _getVisualRadius(node: RenderNode, zoom: number): number {
    const baseRadius = node.radius;
    const overview = this._overviewFactor(zoom);
    if (overview <= 0) return baseRadius;

    const safeZoom = Math.max(zoom, 0.0005);
    const isInjector = node.type === 'injector';
    const isRoot = !!node.meta?.isRoot;
    const unusedFactor = node.meta?.isUnused ? 0.74 : 1;
    const tierScale = this._overviewTierScale(node);
    const baseScreenRadius = baseRadius * zoom;
    const fullScreenRadius = isInjector ? (isRoot ? 16 : 13) : 8.5 * unusedFactor;
    const tieredScreenRadius = Math.max(isInjector ? 3.5 : 2.1, fullScreenRadius * tierScale);
    const stepBoost = this._overviewStepBoost(zoom, tierScale, isRoot);
    const targetScreenRadius = tieredScreenRadius + stepBoost;
    const screenRadius = this._lerp(baseScreenRadius, targetScreenRadius, overview);

    return Math.max(baseRadius, screenRadius / safeZoom);
  }

  private _overviewFactor(zoom: number): number {
    if (zoom >= 0.72) return 0;
    if (zoom <= 0.20) return 1;
    return Math.max(0, Math.min(1, (0.72 - zoom) / 0.52));
  }

  private _overviewTierScale(node: RenderNode): number {
    if (node.meta?.isRoot) return 1;

    const importance = this._getNodeImportance(node);
    if (importance >= 0.82) return 0.75;
    if (importance >= 0.52) return 0.5;
    return 0.25;
  }

  private _overviewStepBoost(zoom: number, tierScale: number, isRoot: boolean): number {
    let boost = 0;
    if (zoom < 0.42 && tierScale >= 0.5) boost += 1.2;
    if (zoom < 0.24 && tierScale >= 0.75) boost += 1.6;
    if (zoom < 0.12 && (tierScale >= 0.75 || isRoot)) boost += 1.8;
    if (zoom < 0.06 && isRoot) boost += 2.2;
    return boost;
  }

  private _drawOverviewBeacon(
    _ctx: CanvasRenderingContext2D,
    node: RenderNode,
    zoom: number,
    radius: number,
    isHighlight: boolean
  ): void {
    const overview = this._overviewFactor(zoom);
    if (overview <= 0) return;

    const importance = this._getNodeImportance(node);
    const isRoot = !!node.meta?.isRoot;
    const isProminent = isRoot
      || isHighlight
      || (node.type === 'injector' && importance >= 0.52)
      || (node.type === 'service' && importance >= 0.82);
    if (!isProminent) return;

    const previousAlpha = _ctx.globalAlpha;
    const alpha = previousAlpha * overview * (isRoot ? 0.24 : node.type === 'injector' ? 0.15 : 0.10);
    _ctx.globalAlpha = alpha;
    _ctx.beginPath();
    _ctx.arc(node.x, node.y, radius * (isRoot ? 2.4 : 1.95), 0, Math.PI * 2);
    _ctx.strokeStyle = node.glowColor;
    _ctx.lineWidth = Math.max(0.8, 1.15 / Math.max(zoom, 0.0005));
    _ctx.stroke();

    if (isRoot || importance >= 0.82 || isHighlight) {
      _ctx.globalAlpha = alpha * 0.45;
      _ctx.beginPath();
      _ctx.arc(node.x, node.y, radius * (isRoot ? 3.6 : 2.75), 0, Math.PI * 2);
      _ctx.stroke();
    }

    _ctx.globalAlpha = previousAlpha;
  }

  private _drawNode(_ctx: CanvasRenderingContext2D, node: RenderNode, zoom: number, isFocusActive: boolean, time: number) {
    let nodeOpacity = 1.0;
    const isHighlight = this.hoveredNode === node || this.pinnedNode === node;
    const visualRadius = this._getVisualRadius(node, zoom);

    if (isFocusActive) {
      const isNeighbor = this._focusedNodeIds.has(node.id);
      if (!isHighlight && !isNeighbor) {
        nodeOpacity = this._lerp(1.0, 0.1, this._currentFocusLevel);
      }
    }

    if (node.meta?.isUnused && !this._unusedPattern) nodeOpacity *= 0.4;

    _ctx.globalAlpha = nodeOpacity;
    this._drawOverviewBeacon(_ctx, node, zoom, visualRadius, isHighlight);

    if (node.type === 'injector') {
      this._drawHexagon(_ctx, node, zoom, isHighlight, time, visualRadius);
    } else {
      const isFramework = !!node.meta?.isFramework;
      const isUnused = !!node.meta?.isUnused;
      this._drawDiamond(_ctx, node, zoom, isHighlight, time, isFramework, isUnused, visualRadius);
    }

    _ctx.globalAlpha = 1.0;
  }

  private _drawHexagon(_ctx: CanvasRenderingContext2D, node: RenderNode, zoom: number, isHighlight: boolean, time: number, radius: number) {
    const {x, y, baseColor, glowColor} = node;
    let currentAngle = node.angle || 0;
    if (this._shouldAnimateVisuals()) {
      currentAngle += time * (isHighlight ? 0.002 : 0.0005);
    }

    if (isHighlight || node.meta?.isRoot) {
      _ctx.shadowBlur = isHighlight ? 30 : 15;
      _ctx.shadowColor = glowColor;
    }

    _ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const theta = currentAngle + (i * Math.PI * 2) / 6;
      _ctx[i === 0 ? 'moveTo' : 'lineTo'](x + radius * Math.cos(theta), y + radius * Math.sin(theta));
    }
    _ctx.closePath();
    _ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
    _ctx.fill();
    _ctx.shadowBlur = 0;

    _ctx.strokeStyle = baseColor;
    _ctx.lineWidth = (isHighlight ? 2 : 1.5) / zoom;
    _ctx.stroke();

    _ctx.beginPath();
    if (node.meta?.isRoot) {
      _ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
      _ctx.fillStyle = glowColor;
      _ctx.fill();
    } else {
      for (let i = 0; i < 6; i++) {
        const theta = -currentAngle * 2 + (i * Math.PI * 2) / 6;
        const r = radius * 0.5;
        _ctx[i === 0 ? 'moveTo' : 'lineTo'](x + r * Math.cos(theta), y + r * Math.sin(theta));
      }
      _ctx.closePath();
      _ctx.strokeStyle = baseColor;
      _ctx.lineWidth = 0.5 / zoom;
      _ctx.stroke();
    }

    if (isHighlight || this._shouldRenderLabels(zoom, 0.6) || this._shouldRenderOverviewLabel(node, zoom)) {
      this._drawLabel(_ctx, node, y + radius + 12 / zoom, zoom, isHighlight || this._shouldRenderOverviewLabel(node, zoom));
    }
  }

  private _drawDiamond(_ctx: CanvasRenderingContext2D, node: RenderNode, zoom: number, isHighlight: boolean, time: number, isFramework: boolean, isUnused: boolean, radius: number) {
    const {x, y, baseColor, glowColor} = node;
    let sizeAnim = radius;

    if (this._shouldAnimateVisuals()) {
      const pulse = Math.sin((time + (node.pulseOffset || 0)) / (isFramework ? 600 : 400));
      sizeAnim = radius * (1 + pulse * 0.1);
    }


    if (isHighlight || node.meta?.isRoot) {
      _ctx.shadowBlur = isHighlight ? 20 : 10;
      _ctx.shadowColor = glowColor;
    } else if (isFramework) {
      _ctx.shadowBlur = 5;
      _ctx.shadowColor = baseColor;
    }

    _ctx.beginPath();
    _ctx.moveTo(x, y - sizeAnim);
    _ctx.lineTo(x + sizeAnim, y);
    _ctx.lineTo(x, y + sizeAnim);
    _ctx.lineTo(x - sizeAnim, y);
    _ctx.closePath();


    if (isUnused && this._unusedPattern) {
      _ctx.fillStyle = this._unusedPattern;
      _ctx.fill();
    } else if (isFramework) {

      const grad = _ctx.createLinearGradient(x - sizeAnim, y - sizeAnim, x + sizeAnim, y + sizeAnim);
      grad.addColorStop(0, 'rgba(0,0,0,0.8)');
      grad.addColorStop(0.5, baseColor + '11');
      grad.addColorStop(1, 'rgba(0,0,0,0.8)');
      _ctx.fillStyle = grad;
      _ctx.fill();
    } else {
      _ctx.fillStyle = isHighlight ? glowColor : baseColor;
      _ctx.fill();
    }


    _ctx.strokeStyle = isHighlight ? glowColor : baseColor;
    _ctx.lineWidth = (isHighlight ? 2.5 : 1.5) / zoom;
    if (isUnused) {
      _ctx.strokeStyle = '#64748b';
    }
    _ctx.stroke();

    _ctx.shadowBlur = 0;

    if (isHighlight || this._shouldRenderLabels(zoom, 0.8) || this._shouldRenderOverviewLabel(node, zoom)) {
      this._drawLabel(_ctx, node, y + radius + 10 / zoom, zoom, isHighlight || this._shouldRenderOverviewLabel(node, zoom));
    }
  }

  private _drawLabel(_ctx: CanvasRenderingContext2D, node: RenderNode, yPos: number, zoom: number, isHighlight: boolean) {
    _ctx.fillStyle = isHighlight ? '#fff' : 'rgba(226, 232, 240, 0.8)';
    if (node.meta?.isUnused) _ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';

    const fontSize = Math.max(9, 11 / zoom);
    _ctx.font = `${isHighlight ? 'bold' : ''} ${fontSize}px "JetBrains Mono"`;
    _ctx.textAlign = 'center';
    _ctx.fillText(node.meta?.label || '', node.x, yPos);
  }

  private _drawGrid(_ctx: CanvasRenderingContext2D, w: number, h: number, tx: number, ty: number, zoom: number) {
    const gridSize = Math.max(25, 100 * zoom);
    const offsetX = (tx % gridSize);
    const offsetY = (ty % gridSize);

    _ctx.beginPath();
    for (let x = offsetX; x < w; x += gridSize) {
      _ctx.moveTo(x, 0);
      _ctx.lineTo(x, h);
    }
    for (let y = offsetY; y < h; y += gridSize) {
      _ctx.moveTo(0, y);
      _ctx.lineTo(w, y);
    }
    _ctx.strokeStyle = CONSTELLATION_THEME.grid;
    _ctx.lineWidth = 1;
    _ctx.stroke();
  }
}
