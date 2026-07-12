import {NgZone} from '@angular/core';
import {
  CONSTELLATION_THEME,
  ConstellationGraphStats,
  ConstellationLinkRenderMode,
  LinkAnimState,
  RenderLink,
  RenderNode
} from '../models/constellation.models';
import {ConstellationPhysicsController} from './constellation-physics.controller';
import {ATLAS_SPATIAL_CELL_SIZE, ConstellationSpatialIndex} from './constellation-spatial-index';
import {clamp01, easedFrameStep, lerp, smoothStep, stableHash} from './render/render-math';
import {ConstellationLinkRenderer} from './render/link-renderer';
import {ConstellationNodeRenderer} from './render/node-renderer';
import {NodeVisuals} from './render/node-visuals';
import {
  ConstellationRegionRenderer,
  GROUP_REGION_MAX_DRAWN,
  SUBGROUP_REGION_MAX_DRAWN
} from './render/region-renderer';
import {
  DisplayPosition,
  FrameContext,
  GroupRegion,
  RenderScene,
  ViewBounds,
  VisibleLinkCandidates
} from './render/render-types';

interface GraphBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

interface RelationSlot {
  angle: number;
  ringIndex: number;
  slotIndex: number;
  slotCount: number;
}

interface RenderableNodesCache {
  key: string;
  nodes: RenderNode[];
}

export interface ConstellationEnginePerformanceSample {
  durationMs: number;
  frameDeltaMs: number;
  renderableNodes: number;
  totalNodes: number;
  totalLinks: number;
  zoom: number;
  layoutMode: ConstellationGraphStats['layoutMode'] | 'unknown';
  lensAnimating: boolean;
}

const ATLAS_MAX_DRAWN_NODES = 9000;
const ATLAS_MAX_SPATIAL_CELLS_PER_FRAME = 25000;
const FOCUS_TRANSITION_MS = 180;
const VIEWPORT_LENS_MAX_NODES = 720;
const VIEWPORT_LENS_TRANSITION_MS = 760;
const LAYOUT_TRANSITION_MS = 640;

export class ConstellationEngine {
  private readonly _ctx: CanvasRenderingContext2D;
  private readonly _physics: ConstellationPhysicsController;
  private _animationFrameId: number = 0;
  private _destroyed = false;

  private _renderNodes = new Map<string, RenderNode>();
  private _renderLinks: RenderLink[] = [];
  private _providerLinks: RenderLink[] = [];
  private _dependencyLinks: RenderLink[] = [];
  private _componentLinks: RenderLink[] = [];
  private _aggregateLinks: RenderLink[] = [];
  private _linksByNodeId = new Map<string, RenderLink[]>();
  private _relationChildIdsByParentId = new Map<string, string[]>();
  private _relationChildIdSetsByParentId = new Map<string, Set<string>>();
  private _relationSlotCache = new Map<string, RelationSlot>();
  private _relationGroupSignatures = new Map<string, string>();
  private _dependencyDegreeByNodeId = new Map<string, number>();
  private readonly _spatial = new ConstellationSpatialIndex({
    getNodes: () => this._renderNodes,
    isStaticLayout: () => this._isStaticLayout()
  });
  private readonly _nodeVisuals = new NodeVisuals({
    degreeOf: (id) => this._dependencyDegreeByNodeId.get(id) ?? 0,
    nodeCount: () => this._renderNodes.size,
    isHugeGraph: () => this._isHugeGraph()
  });
  /** Live view of this engine's graph data + position helpers, handed to the renderers. */
  private readonly _scene: RenderScene = this._createRenderScene();
  private readonly _regionRenderer = new ConstellationRegionRenderer(this._scene);
  private readonly _linkRenderer = new ConstellationLinkRenderer(this._scene);
  private readonly _nodeRenderer = new ConstellationNodeRenderer(this._scene, this._nodeVisuals);
  private _groupRegions: GroupRegion[] = [];
  private _subgroupRegions: GroupRegion[] = [];
  private _graphBounds: GraphBounds | null = null;
  private _graphStats: ConstellationGraphStats | null = null;
  private _linkAnimStates = new Map<string, LinkAnimState>();

  private _width = 800;
  private _height = 600;
  private _dpiScale = 1;
  private _viewTransform = {x: 0, y: 0, k: 1};

  private _focusedNodeIds = new Set<string>();
  private _currentFocusLevel = 0;
  private _displayPositions = new Map<string, DisplayPosition>();
  // Animated reflow when the layout changes (e.g. switching grouping) while FX is enabled: nodes tween
  // from their previous positions to the new layout's positions over LAYOUT_TRANSITION_MS.
  private _transitionPositions = new Map<string, DisplayPosition>();
  private _layoutTransition: { startAt: number; durationMs: number; from: Map<string, DisplayPosition> } | null = null;
  private _zoomOutSpreadScale = 1;
  private _viewportLensAnimating = false;
  private _lastFrameAt = 0;
  private _renderDirty = true;
  private _performanceFrameIndex = 0;
  private _renderDataVersion = 0;
  private _displayPositionVersion = 0;
  private _renderableNodesCache: RenderableNodesCache | null = null;
  private _lastRenderableNodesKey = '';


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
    private readonly _onTickPositionsUpdate: (positions: { id: string, x: number, y: number }[]) => void,
    private readonly _onPerformanceSample?: (sample: ConstellationEnginePerformanceSample) => void
  ) {
    this._ctx = this._canvas.getContext('2d', {alpha: false}) as CanvasRenderingContext2D;
    this._physics = new ConstellationPhysicsController({
      onTickResult: (positions) => this._onTickPositionsUpdate(positions),
      isStaticLayout: () => this._isStaticLayout(),
      getNodeCount: () => this._renderNodes.size,
      isHugeGraph: () => this._isHugeGraph()
    });
    this._createUnusedPattern();
  }

  /**
   * Build the {@link RenderScene} the renderers read. Getters expose live engine state (the data maps are
   * reassigned on each data update, so a snapshot would go stale), and the position helpers delegate to
   * the engine's own transition/spread logic.
   */
  private _createRenderScene(): RenderScene {
    const engine = this;
    return {
      get renderNodes() { return engine._renderNodes; },
      get renderLinks() { return engine._renderLinks; },
      get linksByNodeId() { return engine._linksByNodeId; },
      get linkAnimStates() { return engine._linkAnimStates; },
      get dependencyDegreeByNodeId() { return engine._dependencyDegreeByNodeId; },
      get groupRegions() { return engine._groupRegions; },
      get subgroupRegions() { return engine._subgroupRegions; },
      get unusedPattern() { return engine._unusedPattern; },
      get renderDataVersion() { return engine._renderDataVersion; },
      get renderableNodesKey() { return engine._lastRenderableNodesKey; },
      getDisplayPosition: (node) => engine._getDisplayPosition(node),
      applyZoomOutSpread: (x, y) => engine._applyZoomOutSpread(x, y),
      scaleZoomOutDistance: (value) => engine._scaleZoomOutDistance(value)
    };
  }

  start() {
    this._zone.runOutsideAngular(() => {
      const loop = () => {
        if (this._destroyed) return;
        const now = performance.now();
        this._physics.maybeTick(now, this.isPaused);
        if (this._layoutTransition) this._advanceLayoutTransition(now);
        if (this._shouldRenderFrame()) {
          this._renderFrame();
          // Consume the dirty flag after every paint (all layout modes). A live force sim keeps
          // itself repainting via _shouldRenderFrame; once idle, only a real change repaints again.
          this._renderDirty = false;
        }
        this._animationFrameId = requestAnimationFrame(loop);
      };
      loop();
    });
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._animationFrameId);
    this._physics.destroy();
  }

  resize(width: number, height: number, dpi: number) {
    this._width = width;
    this._height = height;
    this._dpiScale = dpi;
    this._canvas.width = width * dpi;
    this._canvas.height = height * dpi;
    this._renderDirty = true;

    this._createUnusedPattern();

    this._physics.resize(width, height);
  }

  updateGraphData(
    nodes: any[],
    links: any[],
    renderNodes: Map<string, RenderNode>,
    renderLinks: RenderLink[],
    stats?: ConstellationGraphStats
  ) {
    // Snapshot where the nodes are NOW (before swapping in the new layout) so we can animate the
    // reflow from here to the new positions.
    const previousPositions = new Map<string, DisplayPosition>();
    for (const [id, node] of this._renderNodes) {
      const p = this._transitionPositions.get(id) ?? this._displayPositions.get(id) ?? node;
      previousPositions.set(id, {x: p.x, y: p.y});
    }

    this._renderNodes = renderNodes;
    this._renderLinks = renderLinks;
    this._graphStats = stats ?? null;
    this._renderDataVersion++;
    for (const id of this._displayPositions.keys()) {
      if (!renderNodes.has(id)) this._displayPositions.delete(id);
    }
    this._relationSlotCache.clear();
    this._relationGroupSignatures.clear();
    this._rebuildLinkIndexes(renderLinks);
    this._spatial.rebuild();
    this._rebuildGroupRegions();
    this._rebuildGraphBounds();
    this._zoomOutSpreadScale = 1;
    if (this.hoveredNode) this.hoveredNode = this._renderNodes.get(this.hoveredNode.id) ?? null;
    if (this.pinnedNode) this.pinnedNode = this._renderNodes.get(this.pinnedNode.id) ?? null;
    this._updateFocusSet(this._getActiveFocusNode());
    this._renderDirty = true;
    this._maybeStartLayoutTransition(previousPositions);
    this._invalidateFrameCaches();

    if (renderLinks.length > this._linkRenderer.animatedLinkLimit(this._isHugeGraph())) {
      this._linkAnimStates.clear();
    } else {
      const currentLinkIds = new Set<string>();
      for (const link of renderLinks) currentLinkIds.add(link.uniqueId);
      for (const id of this._linkAnimStates.keys()) {
        if (!currentLinkIds.has(id)) this._linkAnimStates.delete(id);
      }
    }

    this._physics.setData(nodes, links);
  }

  updatePositions(positions: { id: string, x: number, y: number }[]) {
    for (const pos of positions) {
      const node = this._renderNodes.get(pos.id);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
    this._rebuildGraphBounds();
    this._renderDataVersion++;
    this._invalidateFrameCaches();
    this._renderDirty = true;
  }

  updateTransform(transform: { x: number, y: number, k: number }) {
    this._viewTransform = transform;
    this._renderDirty = true;
  }

  getViewTransform() {
    return {...this._viewTransform};
  }

  /** World-space bounding box of the current graph (for fit-to-view). Null before the first layout. */
  getGraphBounds(): { centerX: number; centerY: number; width: number; height: number } | null {
    const b = this._graphBounds;
    return b ? {centerX: b.centerX, centerY: b.centerY, width: b.width, height: b.height} : null;
  }

  updatePhysics(repulsion: number) {
    this._physics.updateRepulsion(repulsion);
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

  private _invalidateFrameCaches(): void {
    this._renderableNodesCache = null;
    this._linkRenderer.invalidateCache();
    this._lastRenderableNodesKey = '';
  }

  resetEntropy() {
    if (this._isStaticLayout()) return;
    this._physics.resetEntropy();
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
      const position = this._getDisplayPosition(node);
      const dx = worldX - position.x;
      const dy = worldY - position.y;
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
    this._aggregateLinks = [];
    this._linksByNodeId = new Map<string, RenderLink[]>();
    this._relationChildIdsByParentId = new Map<string, string[]>();
    this._relationChildIdSetsByParentId = new Map<string, Set<string>>();
    this._dependencyDegreeByNodeId = new Map<string, number>();

    for (const link of renderLinks) {
      if (link.type === 'provider') this._providerLinks.push(link);
      else if (link.type === 'dependency') this._dependencyLinks.push(link);
      else if (link.type === 'component-child') this._componentLinks.push(link);
      else this._aggregateLinks.push(link);

      this._addIndexedLink(link.sourceId, link);
      this._addIndexedLink(link.targetId, link);
      if (link.type === 'provider' || link.type === 'component-child') {
        this._addRelationChild(link.sourceId, link.targetId);
      }

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

  private _addRelationChild(parentId: string, childId: string): void {
    let childSet = this._relationChildIdSetsByParentId.get(parentId);
    let children = this._relationChildIdsByParentId.get(parentId);

    if (!childSet || !children) {
      childSet = new Set<string>();
      children = [];
      this._relationChildIdSetsByParentId.set(parentId, childSet);
      this._relationChildIdsByParentId.set(parentId, children);
    }

    if (childSet.has(childId)) return;

    childSet.add(childId);
    children.push(childId);
  }

  private _rebuildGraphBounds(): void {
    if (this._renderNodes.size === 0) {
      this._graphBounds = null;
      return;
    }

    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const node of this._renderNodes.values()) {
      const radius = Math.max(24, node.radius ?? 0);
      left = Math.min(left, node.x - radius);
      right = Math.max(right, node.x + radius);
      top = Math.min(top, node.y - radius);
      bottom = Math.max(bottom, node.y + radius);
    }

    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    this._graphBounds = {
      left,
      right,
      top,
      bottom,
      centerX: left + width / 2,
      centerY: top + height / 2,
      width,
      height
    };
  }

  private _rebuildGroupRegions(): void {
    const regionsByKey = new Map<string, GroupRegion>();
    const subgroupRegionsByKey = new Map<string, GroupRegion>();

    for (const node of this._renderNodes.values()) {
      const key = node.meta?.groupKey;
      if (key && key !== 'root') {
        const centerX = node.meta?.groupCenterX;
        const centerY = node.meta?.groupCenterY;
        const radius = node.meta?.groupRadius;
        if (centerX !== undefined && centerY !== undefined && radius !== undefined) {
          const existing = regionsByKey.get(key);
          const importance = this._nodeVisuals.importance(node);
          const memberCount = Math.max(1, node.meta?.groupMemberCount ?? 1);
          if (existing) {
            existing.memberCount = Math.max(existing.memberCount, memberCount);
            existing.importance = Math.max(existing.importance, importance);
            existing.radius = Math.max(existing.radius, radius);
          } else {
            regionsByKey.set(key, {
              key,
              label: node.meta?.groupLabel ?? key,
              level: 'group',
              x: centerX,
              y: centerY,
              radius,
              memberCount,
              colorSeed: node.meta?.groupColorSeed ?? stableHash(key),
              importance
            });
          }
        }
      }

      const subgroupKey = node.meta?.subgroupKey;
      if (!subgroupKey || subgroupKey === 'root') continue;

      const subgroupCenterX = node.meta?.subgroupCenterX;
      const subgroupCenterY = node.meta?.subgroupCenterY;
      const subgroupRadius = node.meta?.subgroupRadius;
      if (subgroupCenterX === undefined || subgroupCenterY === undefined || subgroupRadius === undefined) continue;

      const regionKey = `${key ?? 'group'}:${subgroupKey}`;
      const existingSubgroup = subgroupRegionsByKey.get(regionKey);
      const importance = this._nodeVisuals.importance(node);
      const memberCount = Math.max(1, node.meta?.subgroupMemberCount ?? 1);
      if (existingSubgroup) {
        existingSubgroup.memberCount = Math.max(existingSubgroup.memberCount, memberCount);
        existingSubgroup.importance = Math.max(existingSubgroup.importance, importance);
        existingSubgroup.radius = Math.max(existingSubgroup.radius, subgroupRadius);
      } else {
        subgroupRegionsByKey.set(regionKey, {
          key: regionKey,
          label: node.meta?.subgroupLabel ?? subgroupKey,
          level: 'subgroup',
          x: subgroupCenterX,
          y: subgroupCenterY,
          radius: subgroupRadius,
          memberCount,
          colorSeed: stableHash(regionKey),
          importance
        });
      }
    }

    this._groupRegions = Array.from(regionsByKey.values())
      .sort((a, b) => {
        const radiusDiff = b.radius - a.radius;
        if (Math.abs(radiusDiff) > 1) return radiusDiff;
        return b.importance - a.importance;
      })
      .slice(0, GROUP_REGION_MAX_DRAWN);

    this._subgroupRegions = Array.from(subgroupRegionsByKey.values())
      .sort((a, b) => {
        const radiusDiff = b.radius - a.radius;
        if (Math.abs(radiusDiff) > 1) return radiusDiff;
        return b.importance - a.importance;
      })
      .slice(0, SUBGROUP_REGION_MAX_DRAWN);
  }

  private _getHitTestCandidates(worldX: number, worldY: number): Iterable<RenderNode> {
    if (!this._isStaticLayout()) return this._renderNodes.values();
    if (this._zoomOutSpreadScale > 1.01) return this._renderNodes.values();

    const {candidates, seenIds} = this._spatial.queryNeighbourhood(worldX, worldY);

    if (this._displayPositions.size > 0 && this._displayPositions.size <= VIEWPORT_LENS_MAX_NODES * 2) {
      for (const id of this._displayPositions.keys()) {
        if (seenIds.has(id)) continue;
        const node = this._renderNodes.get(id);
        if (node) candidates.push(node);
      }
    }

    return candidates;
  }

  private _getRenderableNodes(bounds: ViewBounds, zoom: number): RenderNode[] {
    if (!this._isStaticLayout()) {
      this._lastRenderableNodesKey = `force:${this._renderDataVersion}:${this._lastFrameAt}`;
      const nodes: RenderNode[] = [];
      for (const node of this._renderNodes.values()) {
        if (this._isNodeInBounds(node, bounds, zoom)) nodes.push(node);
      }
      return nodes;
    }

    const cacheKey = this._renderableNodesCacheKey(bounds, zoom);
    this._lastRenderableNodesKey = cacheKey;
    if (this._renderableNodesCache?.key === cacheKey) {
      return this._renderableNodesCache.nodes;
    }

    const minCellX = Math.floor(bounds.left / ATLAS_SPATIAL_CELL_SIZE);
    const maxCellX = Math.floor(bounds.right / ATLAS_SPATIAL_CELL_SIZE);
    const minCellY = Math.floor(bounds.top / ATLAS_SPATIAL_CELL_SIZE);
    const maxCellY = Math.floor(bounds.bottom / ATLAS_SPATIAL_CELL_SIZE);
    const nodes: RenderNode[] = [];
    const collectLimit = zoom < 0.72 ? ATLAS_MAX_DRAWN_NODES * 2 : ATLAS_MAX_DRAWN_NODES;
    const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
    if (cellCount > ATLAS_MAX_SPATIAL_CELLS_PER_FRAME) {
      return this._cacheRenderableNodes(cacheKey, this._scanRenderableNodes(bounds, zoom, collectLimit));
    }

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        const bucket = this._spatial.getCell(x, y);
        if (!bucket) continue;

        for (const node of bucket) {
          if (!this._isNodeInBounds(node, bounds, zoom)) continue;
          if (!this._passesAtlasNodeLod(node, zoom)) continue;
          nodes.push(node);
          if (nodes.length >= collectLimit) {
            return this._cacheRenderableNodes(cacheKey, this._finalizeRenderableNodes(nodes, bounds, zoom));
          }
        }
      }
    }

    return this._cacheRenderableNodes(cacheKey, this._finalizeRenderableNodes(nodes, bounds, zoom));
  }

  private _renderableNodesCacheKey(bounds: ViewBounds, zoom: number): string {
    return [
      this._renderDataVersion,
      this._displayPositionVersion,
      zoom.toFixed(4),
      Math.round(bounds.left),
      Math.round(bounds.right),
      Math.round(bounds.top),
      Math.round(bounds.bottom)
    ].join(':');
  }

  private _cacheRenderableNodes(key: string, nodes: RenderNode[]): RenderNode[] {
    this._renderableNodesCache = {key, nodes};
    return nodes;
  }

  private _scanRenderableNodes(bounds: ViewBounds, zoom: number, collectLimit: number): RenderNode[] {
    const nodes: RenderNode[] = [];

    for (const node of this._renderNodes.values()) {
      if (!this._isNodeInBounds(node, bounds, zoom)) continue;
      if (!this._passesAtlasNodeLod(node, zoom)) continue;
      nodes.push(node);
      if (zoom >= 0.72 && nodes.length >= collectLimit) break;
    }

    return this._finalizeRenderableNodes(nodes, bounds, zoom);
  }

  private _finalizeRenderableNodes(nodes: RenderNode[], bounds: ViewBounds, zoom: number): RenderNode[] {
    if (this._displayPositions.size > 0) {
      const visibleIds = new Set(nodes.map(node => node.id));
      for (const [id, position] of this._displayPositions) {
        if (visibleIds.has(id)) continue;
        const node = this._renderNodes.get(id);
        if (!node) continue;
        if (!this._isDisplayPositionInBounds(node, position, bounds, zoom)) continue;
        if (!this._passesAtlasNodeLod(node, zoom)) continue;

        nodes.push(node);
        visibleIds.add(id);
      }
    }

    if (zoom < 0.72 && nodes.length > ATLAS_MAX_DRAWN_NODES) {
      nodes.sort((a, b) => this._nodeVisuals.importance(a) - this._nodeVisuals.importance(b));
      return nodes.slice(nodes.length - ATLAS_MAX_DRAWN_NODES);
    }

    return nodes;
  }

  private _isDisplayPositionInBounds(node: RenderNode, position: DisplayPosition, bounds: ViewBounds, zoom: number): boolean {
    const radius = this._nodeVisuals.visualRadius(node, zoom) + 40 / Math.max(zoom, 0.2);
    return position.x + radius >= bounds.left
      && position.x - radius <= bounds.right
      && position.y + radius >= bounds.top
      && position.y - radius <= bounds.bottom;
  }

  private _passesAtlasNodeLod(node: RenderNode, zoom: number): boolean {
    if (node.type === 'injector') return true;
    if (this.hoveredNode?.id === node.id || this.pinnedNode?.id === node.id) return true;
    if (this._focusedNodeIds.has(node.id)) return true;
    if (zoom >= 0.7) return true;

    const degree = this._dependencyDegreeByNodeId.get(node.id) ?? 0;
    const importance = this._nodeVisuals.importance(node);
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

  private _shouldRenderFrame(): boolean {
    if (this._renderDirty
      || this._isFocusTransitionActive()
      || this._viewportLensAnimating
      || this._isLayoutTransitionActive()) {
      return true;
    }
    // Force layout: keep repainting while the simulation is moving OR while the animated FX (energy
    // flows, pulses) are enabled — those are time-based and need continuous frames even after the
    // layout has settled. Go idle only when paused, or when settled with FX off. Physics ticking is
    // gated separately inside the physics controller, so a settled graph still stops the expensive sim.
    if (!this._isStaticLayout()) {
      return !this.isPaused && (this.animationsEnabled || !this._physics.settled);
    }
    return false;
  }

  private _targetFocusLevel(): number {
    return this.focusModeEnabled && this._getActiveFocusNode() ? 1 : 0;
  }

  private _isFocusTransitionActive(): boolean {
    return Math.abs(this._currentFocusLevel - this._targetFocusLevel()) > 0.002;
  }

  private _shouldAnimateVisuals(): boolean {
    return this.animationsEnabled && !this._isStaticLayout();
  }




  private _isHugeGraph(): boolean {
    return this._isStaticLayout()
      || !!this._graphStats?.isHuge
      || this._renderNodes.size > 3500
      || this._renderLinks.length > 12000;
  }

  private _getViewBounds(tx: number, ty: number, zoom: number, width: number, height: number): ViewBounds {
    const safeZoom = Math.max(zoom, 0.0005);
    const margin = (this._isStaticLayout() ? 520 : 120) / safeZoom;
    return {
      left: (-tx / safeZoom) - margin,
      right: ((width - tx) / safeZoom) + margin,
      top: (-ty / safeZoom) - margin,
      bottom: ((height - ty) / safeZoom) + margin
    };
  }

  private _isNodeInBounds(node: RenderNode, bounds: ViewBounds, zoom: number): boolean {
    const radius = this._nodeVisuals.visualRadius(node, zoom) + 40 / Math.max(zoom, 0.2);
    return node.x + radius >= bounds.left
      && node.x - radius <= bounds.right
      && node.y + radius >= bounds.top
      && node.y - radius <= bounds.bottom;
  }


  private _renderFrame() {
    if (!this._ctx) return;
    const _ctx = this._ctx;
    const {_width, _height} = this;
    const time = performance.now();
    const frameDelta = this._lastFrameAt ? Math.min(80, time - this._lastFrameAt) : 16;
    this._lastFrameAt = time;
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
    const targetFocusLevel = this._targetFocusLevel();
    this._currentFocusLevel = lerp(
      this._currentFocusLevel,
      targetFocusLevel,
      easedFrameStep(frameDelta, FOCUS_TRANSITION_MS)
    );
    if (this._currentFocusLevel < 0.001) this._currentFocusLevel = 0;
    if (Math.abs(this._currentFocusLevel - targetFocusLevel) < 0.002) this._currentFocusLevel = targetFocusLevel;
    const isFocusActive = this._currentFocusLevel > 0.01;
    const renderableNodes = this._getRenderableNodes(bounds, zoom);
    const visibleLinkCandidates = this._isHugeGraph()
      ? this._linkRenderer.collectVisibleCandidates(renderableNodes)
      : null;
    this._prepareViewportLens(renderableNodes, zoom, frameDelta, visibleLinkCandidates);

    const frame: FrameContext = {
      ctx: _ctx,
      zoom, tx, ty, bounds, time, frameDelta,
      isFocusActive,
      focusLevel: this._currentFocusLevel,
      focusedNodeIds: this._focusedNodeIds,
      activeFocusNode,
      hoveredNode: this.hoveredNode,
      pinnedNode: this.pinnedNode,
      animationsEnabled: this.animationsEnabled,
      animateVisuals: this._shouldAnimateVisuals(),
      linkRenderMode: this.linkRenderMode,
      staticLayout: this._isStaticLayout(),
      hugeGraph: this._isHugeGraph()
    };

    _ctx.lineCap = 'round';
    this._regionRenderer.draw(frame);
    this._linkRenderer.draw(frame, renderableNodes, visibleLinkCandidates);
    this._linkRenderer.drawDensity(frame, renderableNodes);

    for (const node of renderableNodes) {
      this._nodeRenderer.draw(frame, node);
    }

    this._recordFramePerformance(time, frameDelta, zoom, renderableNodes.length);
  }

  private _recordFramePerformance(
    startedAt: number,
    frameDeltaMs: number,
    zoom: number,
    renderableNodes: number
  ): void {
    if (!this._onPerformanceSample) return;

    const durationMs = performance.now() - startedAt;
    this._performanceFrameIndex++;
    if (durationMs < 18 && this._performanceFrameIndex % 30 !== 0) return;

    this._onPerformanceSample({
      durationMs,
      frameDeltaMs,
      renderableNodes,
      totalNodes: this._renderNodes.size,
      totalLinks: this._renderLinks.length,
      zoom,
      layoutMode: this._graphStats?.layoutMode ?? 'unknown',
      lensAnimating: this._viewportLensAnimating
    });
  }

  private _prepareViewportLens(
    renderableNodes: RenderNode[],
    zoom: number,
    frameDelta: number,
    visibleLinkCandidates: VisibleLinkCandidates | null
  ): void {
    void renderableNodes;
    void visibleLinkCandidates;

    if (this._displayPositions.size > 0) {
      this._displayPositions.clear();
      this._displayPositionVersion++;
      this._invalidateFrameCaches();
    }

    const targetScale = this._targetZoomOutSpreadScale(zoom);
    const ease = easedFrameStep(frameDelta, VIEWPORT_LENS_TRANSITION_MS);
    const previousScale = this._zoomOutSpreadScale;
    this._zoomOutSpreadScale = lerp(previousScale, targetScale, ease);

    if (Math.abs(this._zoomOutSpreadScale - targetScale) < 0.002) {
      this._zoomOutSpreadScale = targetScale;
    }

    this._viewportLensAnimating = Math.abs(this._zoomOutSpreadScale - targetScale) > 0.002;
    if (Math.abs(this._zoomOutSpreadScale - previousScale) > 0.001) {
      this._displayPositionVersion++;
      this._renderDirty = true;
    }
  }

  private _targetZoomOutSpreadScale(zoom: number): number {
    // Zoom-out spread is disabled: it re-projected node positions when zoomed out, which fought
    // deterministic fit-to-view / reset (the camera could never frame the graph because positions
    // moved with zoom). Nodes now always render at their true layout coordinates.
    void zoom;
    return 1;
  }

  /**
   * Begin an animated reflow to the newly-set layout. Only animates when FX is on and the new layout
   * is static (a force layout animates itself via the physics worker), and only when nodes actually
   * moved. Otherwise the new positions are shown immediately (snap).
   */
  private _maybeStartLayoutTransition(previousPositions: Map<string, DisplayPosition>): void {
    this._transitionPositions.clear();
    this._layoutTransition = null;

    if (!this.animationsEnabled || !this._isStaticLayout() || previousPositions.size === 0) {
      return;
    }

    const from = new Map<string, DisplayPosition>();
    let anyMoved = false;
    for (const [id, node] of this._renderNodes) {
      const prev = previousPositions.get(id);
      if (!prev) continue; // a brand-new node simply appears at its target
      from.set(id, prev);
      if (Math.abs(prev.x - node.x) > 1 || Math.abs(prev.y - node.y) > 1) anyMoved = true;
    }
    if (!anyMoved || from.size === 0) return;

    this._layoutTransition = {startAt: performance.now(), durationMs: LAYOUT_TRANSITION_MS, from};
    for (const [id, prev] of from) this._transitionPositions.set(id, {x: prev.x, y: prev.y});
  }

  private _isLayoutTransitionActive(): boolean {
    return this._layoutTransition !== null;
  }

  /** Ease the transition one frame toward the target positions; clears itself when complete. */
  private _advanceLayoutTransition(now: number): void {
    const transition = this._layoutTransition;
    if (!transition) return;

    const raw = (now - transition.startAt) / transition.durationMs;
    if (raw >= 1) {
      this._transitionPositions.clear();
      this._layoutTransition = null;
      this._displayPositionVersion++;
      this._invalidateFrameCaches();
      this._renderDirty = true;
      return;
    }

    const t = smoothStep(clamp01(raw));
    for (const [id, from] of transition.from) {
      const node = this._renderNodes.get(id);
      if (!node) continue;
      let point = this._transitionPositions.get(id);
      if (!point) {
        point = {x: from.x, y: from.y};
        this._transitionPositions.set(id, point);
      }
      point.x = from.x + (node.x - from.x) * t;
      point.y = from.y + (node.y - from.y) * t;
    }
    this._displayPositionVersion++;
    this._invalidateFrameCaches();
    this._renderDirty = true;
  }


  private _getDisplayPosition(node: RenderNode): DisplayPosition {
    const position = this._transitionPositions.get(node.id) ?? this._displayPositions.get(node.id) ?? node;
    if (!this._graphBounds || this._zoomOutSpreadScale <= 1.001) return position;
    return this._applyZoomOutSpread(position.x, position.y);
  }

  private _applyZoomOutSpread(x: number, y: number): DisplayPosition {
    const bounds = this._graphBounds;
    const scale = this._zoomOutSpreadScale;
    if (!bounds || scale <= 1.001) return {x, y};

    return {
      x: bounds.centerX + (x - bounds.centerX) * scale,
      y: bounds.centerY + (y - bounds.centerY) * scale
    };
  }

  private _scaleZoomOutDistance(value: number): number {
    return value * (this._zoomOutSpreadScale > 1.001 ? this._zoomOutSpreadScale : 1);
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
