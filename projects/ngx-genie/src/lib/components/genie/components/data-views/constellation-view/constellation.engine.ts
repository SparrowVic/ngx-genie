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

interface DisplayPosition {
  x: number;
  y: number;
}

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

interface ViewportCluster {
  members: RenderNode[];
  x: number;
  y: number;
  radius: number;
}

interface VisibleLinkCandidates {
  providerLinks: RenderLink[];
  dependencyLinks: RenderLink[];
  componentLinks: RenderLink[];
  aggregateLinks: RenderLink[];
}

interface RenderableNodesCache {
  key: string;
  nodes: RenderNode[];
}

interface VisibleLinkCandidatesCache {
  key: string;
  candidates: VisibleLinkCandidates;
}

interface CollisionNode {
  node: RenderNode;
  movable: boolean;
  radius: number;
  x: number;
  y: number;
}

interface GroupRegion {
  key: string;
  label: string;
  level: 'group' | 'subgroup';
  x: number;
  y: number;
  radius: number;
  memberCount: number;
  colorSeed: number;
  importance: number;
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

const ATLAS_SPATIAL_CELL_SIZE = 720;
const ATLAS_MAX_DRAWN_NODES = 9000;
const ATLAS_MAX_SPATIAL_CELLS_PER_FRAME = 25000;
const FOCUS_TRANSITION_MS = 180;
const FOCUS_DIM_NODE_OPACITY = 0.34;
const FOCUS_DIM_LINK_OPACITY = 0.24;
const VIEWPORT_LENS_MAX_NODES = 720;
const VIEWPORT_LENS_MIN_ZOOM = 0.08;
const VIEWPORT_LENS_MAX_STRENGTH = 0.94;
const VIEWPORT_LENS_TRANSITION_MS = 760;
const VIEWPORT_LENS_MIN_STEP_PX = 4;
const VIEWPORT_LENS_MAX_STEP_PX = 18;
const ZOOM_OUT_SPREAD_TARGET_WIDTH = 1.42;
const ZOOM_OUT_SPREAD_TARGET_HEIGHT = 1.34;
const ZOOM_OUT_SPREAD_MAX_SCALE = 8;
const RELATION_RING_CLOSE_ZOOM_START = 1.05;
const RELATION_RING_CLOSE_ZOOM_END = 2.45;
const RELATION_RING_COMPACT_ZOOM_START = 0.02;
const RELATION_RING_COMPACT_ZOOM_END = 0.58;
const DETAIL_SHRINK_ZOOM_START = 2.2;
const DETAIL_SHRINK_ZOOM_END = 5.8;
const DETAIL_MIN_SCALE = 0.56;
const VIEWPORT_CLUSTER_PACKING_MAX_CLUSTERS = 96;
const VIEWPORT_PARENT_PACKING_MAX_CLUSTERS = 360;
const VIEWPORT_CLUSTER_PACKING_MIN_SPREAD = 0.26;
const VIEWPORT_CLUSTER_PACKING_TARGET_SCALE = 0.30;
const VIEWPORT_CLUSTER_OVERVIEW_TARGET_SCALE = 0.20;
const RELATION_RING_FIRST_RADIUS_PX = 118;
const RELATION_RING_GAP_PX = 86;
const RELATION_RING_MIN_SPACING_PX = 68;
const VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE = 36000;
const COLLISION_GRID_MIN_CELL_PX = 72;
const GROUP_REGION_MAX_DRAWN = 160;
const SUBGROUP_REGION_MAX_DRAWN = 260;

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
  private _aggregateLinks: RenderLink[] = [];
  private _linksByNodeId = new Map<string, RenderLink[]>();
  private _relationChildIdsByParentId = new Map<string, string[]>();
  private _relationChildIdSetsByParentId = new Map<string, Set<string>>();
  private _relationSlotCache = new Map<string, RelationSlot>();
  private _relationGroupSignatures = new Map<string, string>();
  private _dependencyDegreeByNodeId = new Map<string, number>();
  private _nodeSpatialIndex = new Map<string, RenderNode[]>();
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
  private _zoomOutSpreadScale = 1;
  private _viewportLensAnimating = false;
  private _lastFrameAt = 0;
  private _physicsTickPending = false;
  private _lastPhysicsTickAt = 0;
  private _renderDirty = true;
  private _performanceFrameIndex = 0;
  private _renderDataVersion = 0;
  private _displayPositionVersion = 0;
  private _renderableNodesCache: RenderableNodesCache | null = null;
  private _visibleLinkCandidatesCache: VisibleLinkCandidatesCache | null = null;
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
    this._renderDataVersion++;
    for (const id of this._displayPositions.keys()) {
      if (!renderNodes.has(id)) this._displayPositions.delete(id);
    }
    this._relationSlotCache.clear();
    this._relationGroupSignatures.clear();
    this._rebuildLinkIndexes(renderLinks);
    this._rebuildNodeSpatialIndex();
    this._rebuildGroupRegions();
    this._rebuildGraphBounds();
    this._zoomOutSpreadScale = 1;
    if (this.hoveredNode) this.hoveredNode = this._renderNodes.get(this.hoveredNode.id) ?? null;
    if (this.pinnedNode) this.pinnedNode = this._renderNodes.get(this.pinnedNode.id) ?? null;
    this._updateFocusSet(this._getActiveFocusNode());
    this._physicsTickPending = false;
    this._renderDirty = true;
    this._invalidateFrameCaches();

    if (renderLinks.length > this._getAnimatedLinkLimit()) {
      this._linkAnimStates.clear();
    } else {
      const currentLinkIds = new Set<string>();
      for (const link of renderLinks) currentLinkIds.add(link.uniqueId);
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

  private _invalidateFrameCaches(): void {
    this._renderableNodesCache = null;
    this._visibleLinkCandidatesCache = null;
    this._lastRenderableNodesKey = '';
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
            // Static layouts (atlas/organic) never dispatch a TICK (_canDispatchPhysicsTick returns
            // false), so any TICK_RESULT arriving while static is a stale force-simulation result from
            // before the layout switched. Applying it would overwrite the freshly computed static
            // positions permanently (no further tick corrects it) and desync the spatial index.
            if (this._isStaticLayout()) return;
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
          const importance = this._getNodeImportance(node);
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
              colorSeed: node.meta?.groupColorSeed ?? this._stableHash(key),
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
      const importance = this._getNodeImportance(node);
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
          colorSeed: this._stableHash(regionKey),
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

  private _spatialKeyForPoint(x: number, y: number): string {
    return `${Math.floor(x / ATLAS_SPATIAL_CELL_SIZE)}:${Math.floor(y / ATLAS_SPATIAL_CELL_SIZE)}`;
  }

  private _getHitTestCandidates(worldX: number, worldY: number): Iterable<RenderNode> {
    if (!this._isStaticLayout()) return this._renderNodes.values();
    if (this._zoomOutSpreadScale > 1.01) return this._renderNodes.values();

    const cellX = Math.floor(worldX / ATLAS_SPATIAL_CELL_SIZE);
    const cellY = Math.floor(worldY / ATLAS_SPATIAL_CELL_SIZE);
    const candidates: RenderNode[] = [];
    const seenIds = new Set<string>();

    for (let x = cellX - 1; x <= cellX + 1; x++) {
      for (let y = cellY - 1; y <= cellY + 1; y++) {
        const bucket = this._nodeSpatialIndex.get(`${x}:${y}`);
        if (!bucket) continue;
        for (const node of bucket) {
          candidates.push(node);
          seenIds.add(node.id);
        }
      }
    }

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
        const bucket = this._nodeSpatialIndex.get(`${x}:${y}`);
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
      nodes.sort((a, b) => this._getNodeImportance(a) - this._getNodeImportance(b));
      return nodes.slice(nodes.length - ATLAS_MAX_DRAWN_NODES);
    }

    return nodes;
  }

  private _isDisplayPositionInBounds(node: RenderNode, position: DisplayPosition, bounds: ViewBounds, zoom: number): boolean {
    const radius = this._getVisualRadius(node, zoom) + 40 / Math.max(zoom, 0.2);
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

  private _easedFrameStep(deltaMs: number, durationMs: number): number {
    const safeDuration = Math.max(1, durationMs);
    const safeDelta = Math.max(0, Math.min(80, deltaMs));
    return 1 - Math.pow(0.001, safeDelta / safeDuration);
  }

  private _shouldRenderFrame(): boolean {
    if (!this._isStaticLayout()) return true;
    return this._renderDirty || this._isFocusTransitionActive() || this._viewportLensAnimating;
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
    return zoom > this._labelRenderThreshold(minZoom);
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
    const margin = (this._isStaticLayout() ? 520 : 120) / safeZoom;
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

  private _isLinkPositionInBounds(source: DisplayPosition, target: DisplayPosition, bounds: ViewBounds): boolean {
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
    this._currentFocusLevel = this._lerp(
      this._currentFocusLevel,
      targetFocusLevel,
      this._easedFrameStep(frameDelta, FOCUS_TRANSITION_MS)
    );
    if (this._currentFocusLevel < 0.001) this._currentFocusLevel = 0;
    if (Math.abs(this._currentFocusLevel - targetFocusLevel) < 0.002) this._currentFocusLevel = targetFocusLevel;
    const isFocusActive = this._currentFocusLevel > 0.01;
    const renderableNodes = this._getRenderableNodes(bounds, zoom);
    const visibleLinkCandidates = this._isHugeGraph()
      ? this._collectVisibleLinkCandidates(renderableNodes)
      : null;
    this._prepareViewportLens(renderableNodes, zoom, frameDelta, visibleLinkCandidates);

    _ctx.lineCap = 'round';
    this._drawGroupRegions(_ctx, zoom, bounds);
    this._drawLinksForFrame(_ctx, zoom, isFocusActive, time, bounds, activeFocusNode, renderableNodes, visibleLinkCandidates);
    this._drawDependencyDensity(_ctx, zoom, bounds, isFocusActive, renderableNodes);

    for (const node of renderableNodes) {
      this._drawNode(_ctx, node, zoom, isFocusActive, time);
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
    const ease = this._easedFrameStep(frameDelta, VIEWPORT_LENS_TRANSITION_MS);
    const previousScale = this._zoomOutSpreadScale;
    this._zoomOutSpreadScale = this._lerp(previousScale, targetScale, ease);

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
    const bounds = this._graphBounds;
    if (!bounds || this._width <= 0 || this._height <= 0) return 1;

    const safeZoom = Math.max(zoom, 0.0005);
    const screenWidth = bounds.width * safeZoom;
    const screenHeight = bounds.height * safeZoom;
    if (screenWidth <= 0 || screenHeight <= 0) return 1;

    const widthScale = (this._width * ZOOM_OUT_SPREAD_TARGET_WIDTH) / screenWidth;
    const heightScale = (this._height * ZOOM_OUT_SPREAD_TARGET_HEIGHT) / screenHeight;
    const targetScale = Math.min(widthScale, heightScale);

    if (targetScale <= 1.02) return 1;
    return Math.min(ZOOM_OUT_SPREAD_MAX_SCALE, targetScale);
  }

  private _advanceDisplayPosition(
    current: DisplayPosition,
    target: DisplayPosition,
    ease: number,
    zoom: number,
    frameDelta: number
  ): DisplayPosition {
    const next = {
      x: this._lerp(current.x, target.x, ease),
      y: this._lerp(current.y, target.y, ease)
    };
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const screenDistance = Math.hypot(dx, dy) * zoom;
    const maxStep = this._viewportLensMaxStepPx(frameDelta, zoom);

    if (screenDistance <= maxStep) return next;

    const scale = maxStep / Math.max(screenDistance, 0.001);
    return {
      x: current.x + dx * scale,
      y: current.y + dy * scale
    };
  }

  private _viewportLensMaxStepPx(frameDelta: number, zoom: number): number {
    const safeDelta = Math.max(8, Math.min(80, frameDelta));
    const closeZoom = this._closeZoomFactor(zoom);
    const pixelsPerSecond = this._lerp(1040, 640, closeZoom);
    return Math.max(
      VIEWPORT_LENS_MIN_STEP_PX,
      Math.min(VIEWPORT_LENS_MAX_STEP_PX, pixelsPerSecond * safeDelta / 1000)
    );
  }

  private _buildRelationalLensTargets(
    renderableNodes: RenderNode[],
    zoom: number,
    visibleLinkCandidates: VisibleLinkCandidates | null
  ): Map<string, DisplayPosition> {
    const targets = new Map<string, DisplayPosition>();
    if (!this._isStaticLayout()) return targets;
    if (zoom < VIEWPORT_LENS_MIN_ZOOM) return targets;

    const count = renderableNodes.length;
    if (count < 2) return targets;
    const shouldResolveCollisions = count <= VIEWPORT_LENS_MAX_NODES;

    const visibleNodes = new Map<string, RenderNode>();
    for (const node of renderableNodes) {
      visibleNodes.set(node.id, node);
    }

    const groupedChildren = new Map<string, RenderNode[]>();
    const assignedChildren = new Set<string>();
    const providerLinks = visibleLinkCandidates?.providerLinks ?? this._providerLinks;
    const componentLinks = visibleLinkCandidates?.componentLinks ?? this._componentLinks;
    this._collectRelationLensGroups(providerLinks, visibleNodes, groupedChildren, assignedChildren);
    this._collectRelationLensGroups(componentLinks, visibleNodes, groupedChildren, assignedChildren);

    this._applyViewportParentPacking(visibleNodes, targets, zoom);

    for (const [parentId, children] of groupedChildren) {
      const parent = visibleNodes.get(parentId);
      if (!parent || children.length === 0) continue;
      this._assignRelationRingTargets(parent, children, zoom, targets, visibleNodes);
    }

    this._applyViewportClusterPacking(groupedChildren, visibleNodes, targets, zoom);

    return shouldResolveCollisions ? this._resolveLensCollisions(renderableNodes, targets, zoom) : targets;
  }

  private _collectRelationLensGroups(
    links: RenderLink[],
    visibleNodes: Map<string, RenderNode>,
    groupedChildren: Map<string, RenderNode[]>,
    assignedChildren: Set<string>
  ): void {
    for (const link of links) {
      const parent = visibleNodes.get(link.sourceId);
      const child = visibleNodes.get(link.targetId);
      if (!parent || !child || parent === child || assignedChildren.has(child.id)) continue;

      const group = groupedChildren.get(parent.id);
      if (group) {
        group.push(child);
      } else {
        groupedChildren.set(parent.id, [child]);
      }
      assignedChildren.add(child.id);
    }
  }

  private _applyViewportParentPacking(
    visibleNodes: Map<string, RenderNode>,
    targets: Map<string, DisplayPosition>,
    zoom: number
  ): void {
    const clusters: ViewportCluster[] = [];
    const parentNodes: RenderNode[] = [];

    for (const node of visibleNodes.values()) {
      if (node.type !== 'injector') continue;
      parentNodes.push(node);
    }

    if (parentNodes.length > VIEWPORT_PARENT_PACKING_MAX_CLUSTERS) {
      parentNodes.sort((a, b) => this._getNodeImportance(b) - this._getNodeImportance(a));
      parentNodes.length = VIEWPORT_PARENT_PACKING_MAX_CLUSTERS;
    }

    for (const node of parentNodes) {
      const position = targets.get(node.id) ?? node;
      const screenPosition = this._worldToScreen(position);
      clusters.push({
        members: [node],
        x: screenPosition.x,
        y: screenPosition.y,
        radius: this._parentOverviewFootprintRadiusPx(node, 0, zoom)
      });
    }

    if (clusters.length < 2) return;

    const scale = this._viewportClusterPackingScale(clusters, zoom);
    if (scale > 0.985) return;

    const centerX = this._width * 0.5;
    const centerY = this._height * 0.5;
    const safeZoom = Math.max(zoom, VIEWPORT_LENS_MIN_ZOOM);

    for (const cluster of clusters) {
      const parent = cluster.members[0];
      const packedX = centerX + (cluster.x - centerX) * scale;
      const packedY = centerY + (cluster.y - centerY) * scale;
      const currentTarget = targets.get(parent.id) ?? parent;

      targets.set(parent.id, {
        x: currentTarget.x + (packedX - cluster.x) / safeZoom,
        y: currentTarget.y + (packedY - cluster.y) / safeZoom
      });
    }
  }

  private _applyViewportClusterPacking(
    groupedChildren: Map<string, RenderNode[]>,
    visibleNodes: Map<string, RenderNode>,
    targets: Map<string, DisplayPosition>,
    zoom: number
  ): void {
    const clusters = this._buildViewportClusters(groupedChildren, visibleNodes, targets, zoom);
    if (clusters.length < 2 || clusters.length > VIEWPORT_CLUSTER_PACKING_MAX_CLUSTERS) return;

    const scale = this._viewportClusterPackingScale(clusters, zoom);
    if (scale > 0.985) return;

    const centerX = this._width * 0.5;
    const centerY = this._height * 0.5;
    const deltas = new Map<string, { dx: number; dy: number; count: number }>();

    for (const cluster of clusters) {
      const packedX = centerX + (cluster.x - centerX) * scale;
      const packedY = centerY + (cluster.y - centerY) * scale;
      const dx = (packedX - cluster.x) / Math.max(zoom, VIEWPORT_LENS_MIN_ZOOM);
      const dy = (packedY - cluster.y) / Math.max(zoom, VIEWPORT_LENS_MIN_ZOOM);

      for (const member of cluster.members) {
        const delta = deltas.get(member.id);
        if (delta) {
          delta.dx += dx;
          delta.dy += dy;
          delta.count++;
        } else {
          deltas.set(member.id, {dx, dy, count: 1});
        }
      }
    }

    for (const [nodeId, delta] of deltas) {
      const node = visibleNodes.get(nodeId);
      if (!node) continue;

      const currentTarget = targets.get(nodeId) ?? node;
      targets.set(nodeId, {
        x: currentTarget.x + delta.dx / delta.count,
        y: currentTarget.y + delta.dy / delta.count
      });
    }
  }

  private _buildViewportClusters(
    groupedChildren: Map<string, RenderNode[]>,
    visibleNodes: Map<string, RenderNode>,
    targets: Map<string, DisplayPosition>,
    zoom: number
  ): ViewportCluster[] {
    const clusters: ViewportCluster[] = [];
    const clusteredParentIds = new Set<string>();

    for (const [parentId, children] of groupedChildren) {
      const parent = visibleNodes.get(parentId);
      if (!parent || children.length === 0) continue;
      clusteredParentIds.add(parentId);

      const members = this._uniqueClusterMembers(parent, children);
      const parentPosition = targets.get(parent.id) ?? parent;
      const parentScreenPosition = this._worldToScreen(parentPosition);
      let radius = this._parentOverviewFootprintRadiusPx(parent, children.length, zoom);

      for (const member of members) {
        const position = targets.get(member.id) ?? member;
        const screenPosition = this._worldToScreen(position);
        const memberRadius = this._nodeCollisionRadiusPx(member, zoom);
        radius = Math.max(
          radius,
          Math.hypot(screenPosition.x - parentScreenPosition.x, screenPosition.y - parentScreenPosition.y) + memberRadius
        );
      }

      clusters.push({
        members,
        x: parentScreenPosition.x,
        y: parentScreenPosition.y,
        radius: Math.max(28, radius)
      });
    }

    for (const node of visibleNodes.values()) {
      if (node.type !== 'injector' || clusteredParentIds.has(node.id)) continue;

      const position = targets.get(node.id) ?? node;
      const screenPosition = this._worldToScreen(position);
      clusters.push({
        members: [node],
        x: screenPosition.x,
        y: screenPosition.y,
        radius: this._parentOverviewFootprintRadiusPx(node, 0, zoom)
      });
    }

    return clusters;
  }

  private _uniqueClusterMembers(parent: RenderNode, children: RenderNode[]): RenderNode[] {
    const members: RenderNode[] = [parent];
    const seenIds = new Set<string>([parent.id]);

    for (const child of children) {
      if (seenIds.has(child.id)) continue;
      members.push(child);
      seenIds.add(child.id);
    }

    return members;
  }

  private _parentOverviewFootprintRadiusPx(parent: RenderNode, visibleChildCount: number, zoom: number): number {
    const base = Math.max(30, this._nodeCollisionRadiusPx(parent, zoom) + 12);
    const relationChildCount = this._relationChildIdsByParentId.get(parent.id)?.length ?? 0;
    const childCount = Math.max(visibleChildCount, relationChildCount);
    if (childCount <= 0) return base;

    const overview = this._overviewFactor(zoom);
    const parentFootprint = this._relationLayoutFootprintRadiusPx(parent, zoom);
    const childFootprint = Math.max(
      RELATION_RING_MIN_SPACING_PX * 0.5,
      this._lerp(26, 42, this._clamp01(childCount / 28))
    );
    const ringIndex = Math.max(0, Math.ceil(childCount / Math.max(1, this._relationRingCapacity(
      this._relationRingRadiusPx(0, parentFootprint, childFootprint),
      childFootprint
    ))) - 1);
    const relationRadius = this._relationRingRadiusPx(ringIndex, parentFootprint, childFootprint)
      * this._relationRingCompactionScale(zoom, childCount);
    const hiddenChildrenRadius = base + Math.min(96, 18 + Math.sqrt(childCount) * 8.5);
    const footprintRelaxation = this._lerp(0.82, 0.70, overview);
    const relaxedBase = base * this._lerp(0.84, 0.74, overview);

    return Math.max(
      relaxedBase,
      this._lerp(relationRadius, hiddenChildrenRadius, overview * 0.92) * footprintRelaxation
    );
  }

  private _viewportClusterPackingScale(clusters: ViewportCluster[], zoom: number): number {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    let area = 0;

    for (const cluster of clusters) {
      left = Math.min(left, cluster.x - cluster.radius);
      right = Math.max(right, cluster.x + cluster.radius);
      top = Math.min(top, cluster.y - cluster.radius);
      bottom = Math.max(bottom, cluster.y + cluster.radius);
      area += Math.PI * cluster.radius * cluster.radius;
    }

    const viewportArea = Math.max(1, this._width * this._height);
    const occupancy = this._clamp01(area / viewportArea);
    const spread = Math.max(
      (right - left) / Math.max(1, this._width),
      (bottom - top) / Math.max(1, this._height)
    );
    const sparseFactor = 1 - this._smoothStep(this._clamp01((occupancy - 0.24) / 0.38));
    const spreadFactor = this._smoothStep(this._clamp01((spread - VIEWPORT_CLUSTER_PACKING_MIN_SPREAD) / 0.52));
    const countFactor = this._lerp(1, 0.78, this._clamp01((clusters.length - 8) / 56));
    const pull = sparseFactor * spreadFactor * countFactor;
    if (pull <= 0.04) return 1;

    const targetScale = this._lerp(
      VIEWPORT_CLUSTER_PACKING_TARGET_SCALE,
      VIEWPORT_CLUSTER_OVERVIEW_TARGET_SCALE,
      this._overviewFactor(zoom)
    );
    const desiredScale = this._lerp(1, targetScale, pull);
    const safeScale = this._minimumSafeClusterScale(clusters);
    return Math.min(1, Math.max(desiredScale, safeScale));
  }

  private _minimumSafeClusterScale(clusters: ViewportCluster[]): number {
    let minScale = 0;

    for (let i = 0; i < clusters.length; i++) {
      const a = clusters[i];
      for (let j = i + 1; j < clusters.length; j++) {
        const b = clusters[j];
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        if (distance <= 0.001) {
          continue;
        }

        const safeDistance = a.radius + b.radius + 8;
        if (distance <= safeDistance * 1.02) continue;

        minScale = Math.max(minScale, safeDistance / distance);
      }
    }

    return Math.min(0.92, minScale);
  }

  private _assignRelationRingTargets(
    parent: RenderNode,
    children: RenderNode[],
    zoom: number,
    targets: Map<string, DisplayPosition>,
    visibleNodes: Map<string, RenderNode>
  ): void {
    const slotChildren = this._getRelationSlotChildren(parent.id, children);
    const orderedSlotChildren = this._orderRelationSlotChildren(parent, slotChildren);
    const slots = this._ensureRelationSlots(parent, orderedSlotChildren);
    const strength = this._relationLensStrength(parent, children, zoom);
    const compactFactor = this._relationCompactFactor(zoom);
    const targetStrength = Math.max(strength, compactFactor * 0.98);
    if (targetStrength <= 0) return;

    const parentFootprint = this._relationLayoutFootprintRadiusPx(parent, zoom);
    const maxChildFootprint = orderedSlotChildren.reduce(
      (max, child) => Math.max(max, this._relationLayoutFootprintRadiusPx(child, zoom)),
      RELATION_RING_MIN_SPACING_PX * 0.5
    );
    const safeZoom = Math.max(zoom, VIEWPORT_LENS_MIN_ZOOM);
    const ringScale = this._relationRingCompactionScale(zoom, children.length);
    const parentTarget = targets.get(parent.id) ?? parent;
    const sector = this._relationChildSector(parent, parentTarget, children.length, visibleNodes, targets, zoom);

    for (const child of children) {
      const slot = slots.get(child.id);
      if (!slot) continue;

      const ringRadiusPx = this._relationRingRadiusPx(slot.ringIndex, parentFootprint, maxChildFootprint);
      const radius = ringRadiusPx * ringScale / safeZoom;
      const angle = this._relationSlotAngle(slot, sector.center, sector.span, sector.strength);
      const ringTarget = {
        x: parentTarget.x + Math.cos(angle) * radius,
        y: parentTarget.y + Math.sin(angle) * radius
      };
      const childOrigin = child;

      targets.set(child.id, {
        x: this._lerp(childOrigin.x, ringTarget.x, targetStrength),
        y: this._lerp(childOrigin.y, ringTarget.y, targetStrength)
      });
    }
  }

  private _getRelationSlotChildren(parentId: string, fallbackChildren: RenderNode[]): RenderNode[] {
    const childIds = this._relationChildIdsByParentId.get(parentId);
    if (!childIds?.length) return fallbackChildren;

    const children: RenderNode[] = [];
    for (const childId of childIds) {
      const child = this._renderNodes.get(childId);
      if (child) children.push(child);
    }

    return children.length > 0 ? children : fallbackChildren;
  }

  private _orderRelationSlotChildren(parent: RenderNode, children: RenderNode[]): RenderNode[] {
    return [...children].sort((a, b) => {
      const angleA = Math.atan2(a.y - parent.y, a.x - parent.x);
      const angleB = Math.atan2(b.y - parent.y, b.x - parent.x);
      if (Math.abs(angleA - angleB) > 0.0001) return angleA - angleB;
      return a.id.localeCompare(b.id);
    });
  }

  private _ensureRelationSlots(parent: RenderNode, orderedChildren: RenderNode[]): Map<string, RelationSlot> {
    const signature = orderedChildren.map(child => child.id).join('|');
    const cachedSignature = this._relationGroupSignatures.get(parent.id);
    if (cachedSignature === signature) {
      return this._readRelationSlots(parent.id, orderedChildren);
    }

    this._relationGroupSignatures.set(parent.id, signature);
    const parentFootprint = this._relationSlotFootprintRadiusPx(parent);
    const maxChildFootprint = orderedChildren.reduce(
      (max, child) => Math.max(max, this._relationSlotFootprintRadiusPx(child)),
      RELATION_RING_MIN_SPACING_PX * 0.5
    );

    let ringIndex = 0;
    let cursor = 0;
    let ringRadiusPx = this._relationRingRadiusPx(ringIndex, parentFootprint, maxChildFootprint);
    let ringCapacity = this._relationRingCapacity(ringRadiusPx, maxChildFootprint);

    while (cursor < orderedChildren.length) {
      const ringChildren = orderedChildren.slice(cursor, cursor + ringCapacity);
      const angleSlots = ringChildren.length;
      for (let slotIndex = 0; slotIndex < ringChildren.length; slotIndex++) {
        const child = ringChildren[slotIndex];
        this._relationSlotCache.set(
          this._relationSlotKey(parent.id, child.id),
          {
            angle: this._relationRingAngle(slotIndex, angleSlots, ringIndex),
            ringIndex,
            slotIndex,
            slotCount: angleSlots
          }
        );
      }

      cursor += ringChildren.length;
      ringIndex++;
      ringRadiusPx = this._relationRingRadiusPx(ringIndex, parentFootprint, maxChildFootprint);
      ringCapacity = this._relationRingCapacity(ringRadiusPx, maxChildFootprint);
    }

    return this._readRelationSlots(parent.id, orderedChildren);
  }

  private _readRelationSlots(parentId: string, children: RenderNode[]): Map<string, RelationSlot> {
    const slots = new Map<string, RelationSlot>();
    for (const child of children) {
      const slot = this._relationSlotCache.get(this._relationSlotKey(parentId, child.id));
      if (slot) slots.set(child.id, slot);
    }
    return slots;
  }

  private _relationSlotKey(parentId: string, childId: string): string {
    return `${parentId}->${childId}`;
  }

  private _relationSlotFootprintRadiusPx(node: RenderNode): number {
    const baseRadius = node.type === 'injector' ? node.radius + 20 : node.radius + 18;
    return Math.max(RELATION_RING_MIN_SPACING_PX * 0.5, baseRadius);
  }

  private _relationChildSector(
    parent: RenderNode,
    parentTarget: DisplayPosition,
    childCount: number,
    visibleNodes: Map<string, RenderNode>,
    targets: Map<string, DisplayPosition>,
    zoom: number
  ): { center: number; span: number; strength: number } {
    const compactFactor = this._relationCompactFactor(zoom);
    if (compactFactor <= 0.01) return {center: 0, span: Math.PI * 2, strength: 0};

    const parentScreen = this._worldToScreen(parentTarget);
    const viewportCenter = {x: this._width * 0.5, y: this._height * 0.5};
    let forceX = parentScreen.x - viewportCenter.x;
    let forceY = parentScreen.y - viewportCenter.y;
    const viewportDiagonal = Math.hypot(this._width, this._height);
    const centerDistance = Math.hypot(forceX, forceY);

    if (centerDistance < viewportDiagonal * 0.08) {
      const hashAngle = (this._stableHash(parent.id) % 6283) / 1000;
      forceX += Math.cos(hashAngle) * viewportDiagonal * 0.08;
      forceY += Math.sin(hashAngle) * viewportDiagonal * 0.08;
    }

    for (const node of visibleNodes.values()) {
      if (node.id === parent.id || node.type !== 'injector') continue;

      const screen = this._worldToScreen(targets.get(node.id) ?? node);
      const dx = parentScreen.x - screen.x;
      const dy = parentScreen.y - screen.y;
      const distance = Math.max(80, Math.hypot(dx, dy));
      if (distance > 520) continue;

      const weight = (520 - distance) / 520;
      forceX += (dx / distance) * weight * viewportDiagonal * 0.18;
      forceY += (dy / distance) * weight * viewportDiagonal * 0.18;
    }

    const crowdFactor = this._viewportParentCrowdFactor(visibleNodes);
    const childFactor = this._clamp01((childCount - 1) / 14);
    const strength = compactFactor * this._lerp(0.74, 1, crowdFactor);
    const span = this._lerp(
      Math.PI * 2,
      this._lerp(Math.PI * 0.42, Math.PI * 0.58, childFactor),
      strength
    );

    return {
      center: Math.atan2(forceY, forceX),
      span,
      strength
    };
  }

  private _relationSlotAngle(slot: RelationSlot, centerAngle: number, span: number, strength: number): number {
    if (strength <= 0.01) return slot.angle;

    const normalized = slot.slotCount <= 1
      ? 0
      : (slot.slotIndex / (slot.slotCount - 1)) - 0.5;
    const ringOffset = slot.ringIndex % 2 === 0 ? 0 : (Math.PI / Math.max(8, slot.slotCount)) * 0.55;
    const sectorAngle = centerAngle + normalized * span + ringOffset;
    return this._mixAngles(slot.angle, sectorAngle, strength);
  }

  private _viewportParentCrowdFactor(visibleNodes: Map<string, RenderNode>): number {
    let injectorCount = 0;
    for (const node of visibleNodes.values()) {
      if (node.type === 'injector') injectorCount++;
    }

    const viewportArea = Math.max(1, this._width * this._height);
    const density = injectorCount / viewportArea * 1000000;
    return this._smoothStep(this._clamp01((density - 8) / 42));
  }

  private _relationLayoutFootprintRadiusPx(node: RenderNode, zoom: number): number {
    const footprint = this._nodeFootprintRadiusPx(node, zoom);
    const visualRadius = this._getVisualRadius(node, zoom) * zoom;
    const compactFactor = this._relationCompactFactor(zoom);
    const compactFootprint = Math.max(
      this._relationSlotFootprintRadiusPx(node),
      visualRadius + (node.type === 'injector' ? 18 : 14),
      footprint * (node.type === 'injector' ? 0.52 : 0.46)
    );

    return this._lerp(footprint, compactFootprint, compactFactor);
  }

  private _relationRingCompactionScale(zoom: number, childCount: number): number {
    const compactFactor = this._relationCompactFactor(zoom);
    const denseGroupRecovery = this._clamp01((childCount - 18) / 40) * 0.18;
    const targetScale = 0.20 + denseGroupRecovery;
    return this._lerp(1, targetScale, compactFactor);
  }

  private _relationLensStrength(parent: RenderNode, children: RenderNode[], zoom: number): number {
    if (children.length === 0) return 0;

    let avgDistancePx = 0;
    for (const child of children) {
      avgDistancePx += Math.hypot(child.x - parent.x, child.y - parent.y) * zoom;
    }
    avgDistancePx /= children.length;

    const parentFootprint = this._nodeFootprintRadiusPx(parent, zoom);
    const maxChildFootprint = children.reduce(
      (max, child) => Math.max(max, this._nodeFootprintRadiusPx(child, zoom)),
      RELATION_RING_MIN_SPACING_PX * 0.5
    );
    const firstRingCapacity = this._relationRingCapacity(
      this._relationRingRadiusPx(0, parentFootprint, maxChildFootprint),
      maxChildFootprint
    );
    const idealDistance = this._relationRingRadiusPx(
      Math.max(0, Math.ceil(children.length / firstRingCapacity) - 1),
      parentFootprint,
      maxChildFootprint
    );
    const distanceFactor = this._clamp01((avgDistancePx - idealDistance * 0.72) / Math.max(1, idealDistance * 2.2));
    const groupFactor = this._clamp01((children.length - 1) / 10);
    const zoomFactor = this._smoothStep(this._clamp01((zoom - VIEWPORT_LENS_MIN_ZOOM) / 0.24));

    return VIEWPORT_LENS_MAX_STRENGTH * zoomFactor * (0.62 + distanceFactor * 0.20 + groupFactor * 0.18);
  }

  private _relationRingRadiusPx(ringIndex: number, parentFootprintPx: number, childFootprintPx: number): number {
    const firstRing = Math.max(
      RELATION_RING_FIRST_RADIUS_PX,
      parentFootprintPx + childFootprintPx + RELATION_RING_MIN_SPACING_PX * 0.55
    );
    const ringGap = Math.max(RELATION_RING_GAP_PX, childFootprintPx * 1.35 + RELATION_RING_MIN_SPACING_PX * 0.35);
    return firstRing + ringIndex * ringGap;
  }

  private _relationRingCapacity(radiusPx: number, childFootprintPx: number): number {
    const itemSpacing = Math.max(RELATION_RING_MIN_SPACING_PX, childFootprintPx * 2 + 18);
    return Math.max(4, Math.floor((Math.PI * 2 * radiusPx) / itemSpacing));
  }

  private _relationRingAngle(slotIndex: number, capacity: number, ringIndex: number): number {
    const turnOffset = ringIndex % 2 === 0 ? 0 : Math.PI / capacity;
    return -Math.PI / 2 + turnOffset + slotIndex * (Math.PI * 2 / capacity);
  }

  private _resolveLensCollisions(
    renderableNodes: RenderNode[],
    targets: Map<string, DisplayPosition>,
    zoom: number
  ): Map<string, DisplayPosition> {
    if (targets.size === 0 || renderableNodes.length > VIEWPORT_LENS_MAX_NODES) return targets;

    const movableIds = new Set(targets.keys());
    let maxRadius = COLLISION_GRID_MIN_CELL_PX * 0.5;
    const nodes: CollisionNode[] = renderableNodes.map(node => {
      const target = targets.get(node.id) ?? node;
      const radius = this._nodeCollisionRadiusPx(node, zoom);
      maxRadius = Math.max(maxRadius, radius);
      return {
        node,
        movable: movableIds.has(node.id),
        radius,
        x: target.x * zoom,
        y: target.y * zoom
      };
    });
    const collisionGap = this._collisionGapPx(zoom);
    const cellSize = Math.max(COLLISION_GRID_MIN_CELL_PX, Math.ceil((maxRadius * 2 + collisionGap) * 1.08));
    const iterations = nodes.length > 520 ? 5 : nodes.length > 320 ? 6 : 8;

    for (let iteration = 0; iteration < iterations; iteration++) {
      let hadOverlap = false;
      const grid = this._buildCollisionGrid(nodes, cellSize);

      for (let index = 0; index < nodes.length; index++) {
        const a = nodes[index];
        const cellX = Math.floor(a.x / cellSize);
        const cellY = Math.floor(a.y / cellSize);

        for (let x = cellX - 1; x <= cellX + 1; x++) {
          for (let y = cellY - 1; y <= cellY + 1; y++) {
            const bucket = grid.get(`${x}:${y}`);
            if (!bucket) continue;

            for (const otherIndex of bucket) {
              if (otherIndex <= index) continue;
              if (this._resolveCollisionPair(a, nodes[otherIndex], collisionGap)) {
                hadOverlap = true;
              }
            }
          }
        }
      }

      if (!hadOverlap) break;
    }

    const resolvedTargets = new Map<string, DisplayPosition>();
    for (const item of nodes) {
      if (!item.movable) continue;
      resolvedTargets.set(item.node.id, {
        x: item.x / zoom,
        y: item.y / zoom
      });
    }

    return resolvedTargets;
  }

  private _buildCollisionGrid(nodes: CollisionNode[], cellSize: number): Map<string, number[]> {
    const grid = new Map<string, number[]>();

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const key = `${Math.floor(node.x / cellSize)}:${Math.floor(node.y / cellSize)}`;
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(index);
      } else {
        grid.set(key, [index]);
      }
    }

    return grid;
  }

  private _resolveCollisionPair(a: CollisionNode, b: CollisionNode, collisionGap: number): boolean {
    if (!a.movable && !b.movable) return false;

    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    const minDistance = a.radius + b.radius + collisionGap;
    if (dist >= minDistance) return false;

    if (dist < 0.001) {
      const hash = this._stableHash(`${a.node.id}:${b.node.id}`);
      const angle = (hash % 6283) / 1000;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      dist = 1;
    }

    const overlap = (minDistance - dist) * 0.56;
    const ux = dx / dist;
    const uy = dy / dist;

    if (a.movable && b.movable) {
      a.x -= ux * overlap * 0.5;
      a.y -= uy * overlap * 0.5;
      b.x += ux * overlap * 0.5;
      b.y += uy * overlap * 0.5;
    } else if (a.movable) {
      a.x -= ux * overlap;
      a.y -= uy * overlap;
    } else {
      b.x += ux * overlap;
      b.y += uy * overlap;
    }

    return true;
  }

  private _nodeFootprintRadiusPx(node: RenderNode, zoom: number): number {
    const visualRadiusPx = this._getVisualRadius(node, zoom) * zoom;
    const labelFactor = this._labelFootprintFactor(node, zoom);
    if (labelFactor <= 0.01) return visualRadiusPx + 12;

    const label = node.meta?.label ?? '';
    const fontSizePx = this._labelScreenFontSizePx(zoom, false);
    const labelWidth = Math.min(340, label.length * fontSizePx * 0.62);
    const labelRadius = Math.max(
      visualRadiusPx + 14,
      labelWidth * 0.5 + 16
    );

    return this._lerp(visualRadiusPx + 12, labelRadius, labelFactor);
  }

  private _nodeCollisionRadiusPx(node: RenderNode, zoom: number): number {
    const footprint = this._nodeFootprintRadiusPx(node, zoom);
    const visualRadius = this._getVisualRadius(node, zoom) * zoom;
    const closeZoom = this._closeZoomFactor(zoom);
    const compactRadius = Math.max(
      this._relationSlotFootprintRadiusPx(node),
      visualRadius + (node.type === 'injector' ? 16 : 12),
      footprint * (node.type === 'injector' ? 0.76 : 0.68)
    );

    return this._lerp(footprint, compactRadius, closeZoom);
  }

  private _collisionGapPx(zoom: number): number {
    return this._lerp(10, 5, this._closeZoomFactor(zoom));
  }

  private _labelFootprintFactor(node: RenderNode, zoom: number): number {
    if (this._shouldRenderOverviewLabel(node, zoom)) return 0.72;

    const minZoom = node.type === 'injector' ? 0.6 : 0.8;
    const threshold = this._labelRenderThreshold(minZoom);
    return this._smoothStep(this._clamp01((zoom - (threshold - 0.36)) / 0.72));
  }

  private _labelRenderThreshold(minZoom: number): number {
    const count = this._renderNodes.size;
    if (this._isHugeGraph()) return minZoom + 1.45;
    if (count > 3000) return minZoom + 1.1;
    if (count > 1000) return minZoom + 0.55;
    return minZoom;
  }

  private _getDisplayPosition(node: RenderNode): DisplayPosition {
    const position = this._displayPositions.get(node.id) ?? node;
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

  private _worldToScreen(position: DisplayPosition): DisplayPosition {
    const {x: tx, y: ty, k: zoom} = this._viewTransform;
    return {
      x: position.x * zoom + tx,
      y: position.y * zoom + ty
    };
  }

  private _clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private _smoothStep(value: number): number {
    const t = this._clamp01(value);
    return t * t * (3 - 2 * t);
  }

  private _mixAngles(from: number, to: number, t: number): number {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * this._clamp01(t);
  }

  private _closeZoomFactor(zoom: number): number {
    return this._smoothStep(
      this._clamp01((zoom - RELATION_RING_CLOSE_ZOOM_START) / (RELATION_RING_CLOSE_ZOOM_END - RELATION_RING_CLOSE_ZOOM_START))
    );
  }

  private _relationCompactFactor(zoom: number): number {
    return Math.max(
      this._closeZoomFactor(zoom),
      this._smoothStep(
        this._clamp01((zoom - RELATION_RING_COMPACT_ZOOM_START) / (RELATION_RING_COMPACT_ZOOM_END - RELATION_RING_COMPACT_ZOOM_START))
      )
    );
  }

  private _stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private _drawLinksForFrame(
    _ctx: CanvasRenderingContext2D,
    zoom: number,
    isFocusActive: boolean,
    time: number,
    bounds: ViewBounds,
    activeFocusNode: RenderNode | null,
    renderableNodes: RenderNode[],
    visibleLinkCandidates: VisibleLinkCandidates | null
  ) {
    if (!this._isHugeGraph()) {
      this._drawLinkBatch(_ctx, this._renderLinks, zoom, isFocusActive, time, bounds, Number.POSITIVE_INFINITY);
      return;
    }

    const visibleLinks = visibleLinkCandidates ?? this._collectVisibleLinkCandidates(renderableNodes);

    if (this.linkRenderMode === 'all') {
      if (zoom < 2.2) this._drawLinkBatch(_ctx, visibleLinks.aggregateLinks, zoom, isFocusActive, time, bounds, zoom > 1.1 ? 7000 : 3600);
      this._drawLinkBatch(_ctx, visibleLinks.componentLinks, zoom, isFocusActive, time, bounds, zoom > 1.1 ? 10000 : 3500);
      this._drawLinkBatch(_ctx, visibleLinks.providerLinks, zoom, isFocusActive, time, bounds, zoom > 1.1 ? 12000 : 4500);
      this._drawLinkBatch(_ctx, visibleLinks.dependencyLinks, zoom, isFocusActive, time, bounds, zoom > 1.8 ? 14000 : 6000);
      return;
    }

    const structuralCap = zoom > 1.1 ? 7000 : 2600;
    if (zoom < 2.1) {
      this._drawLinkBatch(_ctx, visibleLinks.aggregateLinks, zoom, isFocusActive, time, bounds, zoom > 0.9 ? 5200 : 2800);
    }
    this._drawLinkBatch(_ctx, visibleLinks.componentLinks, zoom, isFocusActive, time, bounds, structuralCap);

    if (this.linkRenderMode !== 'focused' && zoom > 0.45) {
      this._drawLinkBatch(_ctx, visibleLinks.providerLinks, zoom, isFocusActive, time, bounds, zoom > 1.2 ? 6500 : 1800);
    }

    if (activeFocusNode) {
      const focusedLinks = this._linksByNodeId.get(activeFocusNode.id) ?? [];
      this._drawLinkBatch(_ctx, focusedLinks, zoom, isFocusActive, time, bounds, zoom > 1.5 ? 4000 : 1800);
      return;
    }

    if (this.linkRenderMode === 'adaptive' && zoom > 2.2) {
      this._drawLinkBatch(_ctx, visibleLinks.dependencyLinks, zoom, isFocusActive, time, bounds, this._getAdaptiveDependencyLinkCap(zoom));
    }
  }

  private _collectVisibleLinkCandidates(renderableNodes: RenderNode[]): VisibleLinkCandidates {
    const cacheKey = `${this._renderDataVersion}:${this._lastRenderableNodesKey}:${renderableNodes.length}`;
    if (this._visibleLinkCandidatesCache?.key === cacheKey) {
      return this._visibleLinkCandidatesCache.candidates;
    }

    const providerLinks: RenderLink[] = [];
    const dependencyLinks: RenderLink[] = [];
    const componentLinks: RenderLink[] = [];
    const aggregateLinks: RenderLink[] = [];
    const visibleIds = new Set<string>();
    const seenLinkIds = new Set<string>();

    for (const node of renderableNodes) {
      visibleIds.add(node.id);
    }

    for (const node of renderableNodes) {
      const links = this._linksByNodeId.get(node.id);
      if (!links) continue;

      for (const link of links) {
        if (seenLinkIds.has(link.uniqueId)) continue;
        if (!visibleIds.has(link.sourceId) || !visibleIds.has(link.targetId)) continue;

        seenLinkIds.add(link.uniqueId);

        if (link.type === 'provider') {
          if (providerLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) providerLinks.push(link);
        } else if (link.type === 'dependency') {
          if (dependencyLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) dependencyLinks.push(link);
        } else if (link.type === 'component-child') {
          if (componentLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) componentLinks.push(link);
        } else if (aggregateLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) {
          aggregateLinks.push(link);
        }

        if (
          providerLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
          && dependencyLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
          && componentLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
          && aggregateLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
        ) {
          return this._cacheVisibleLinkCandidates(cacheKey, {
            providerLinks,
            dependencyLinks,
            componentLinks,
            aggregateLinks
          });
        }
      }
    }

    return this._cacheVisibleLinkCandidates(cacheKey, {providerLinks, dependencyLinks, componentLinks, aggregateLinks});
  }

  private _cacheVisibleLinkCandidates(key: string, candidates: VisibleLinkCandidates): VisibleLinkCandidates {
    this._visibleLinkCandidatesCache = {key, candidates};
    return candidates;
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

  private _drawGroupRegions(
    _ctx: CanvasRenderingContext2D,
    zoom: number,
    bounds: ViewBounds
  ): void {
    if (!this._isStaticLayout()) return;

    const groupVisibility = this._groupRegionVisibility(zoom);
    const subgroupVisibility = this._subgroupRegionVisibility(zoom);
    if (groupVisibility <= 0 && subgroupVisibility <= 0) return;

    _ctx.save();
    _ctx.setLineDash([]);
    _ctx.lineJoin = 'round';

    if (groupVisibility > 0) {
      this._drawRegionCollection(_ctx, this._groupRegions, zoom, bounds, groupVisibility, GROUP_REGION_MAX_DRAWN);
    }
    if (subgroupVisibility > 0) {
      this._drawRegionCollection(_ctx, this._subgroupRegions, zoom, bounds, subgroupVisibility, SUBGROUP_REGION_MAX_DRAWN);
    }

    _ctx.restore();
  }

  private _drawRegionCollection(
    _ctx: CanvasRenderingContext2D,
    regions: GroupRegion[],
    zoom: number,
    bounds: ViewBounds,
    visibility: number,
    limit: number
  ): void {
    let drawn = 0;
    for (let index = regions.length - 1; index >= 0; index--) {
      const region = regions[index];
      if (!this._isGroupRegionInBounds(region, bounds)) continue;
      if (drawn++ >= limit) break;

      const hue = this._groupRegionHue(region.colorSeed);
      const isSubgroup = region.level === 'subgroup';
      const radius = region.radius * this._lerp(isSubgroup ? 0.90 : 0.82, isSubgroup ? 1.02 : 1.10, visibility);
      const fillAlpha = Math.min(
        isSubgroup ? 0.075 : 0.16,
        ((isSubgroup ? 0.016 : 0.035) + Math.log2(region.memberCount + 1) * (isSubgroup ? 0.006 : 0.012)) * visibility
      );
      const strokeAlpha = Math.min(
        isSubgroup ? 0.24 : 0.42,
        ((isSubgroup ? 0.06 : 0.12) + region.importance * (isSubgroup ? 0.08 : 0.14)) * visibility
      );

      this._drawOrganicGroupBlob(_ctx, region, radius, hue, fillAlpha, strokeAlpha);

      if (!isSubgroup && zoom < 0.36 && (region.importance >= 0.58 || region.memberCount >= 14)) {
        this._drawGroupRegionLabel(_ctx, region, zoom, hue, visibility);
      }
    }
  }

  private _drawOrganicGroupBlob(
    _ctx: CanvasRenderingContext2D,
    region: GroupRegion,
    radius: number,
    hue: number,
    fillAlpha: number,
    strokeAlpha: number
  ): void {
    const points = region.level === 'subgroup' ? 18 : 28;
    const seedA = (region.colorSeed % 6283) / 1000;
    const seedB = ((region.colorSeed >>> 8) % 6283) / 1000;
    const xScale = (region.level === 'subgroup' ? 0.96 : 1.04) + ((region.colorSeed % 17) - 8) * 0.008;
    const yScale = (region.level === 'subgroup' ? 0.86 : 0.78) + (((region.colorSeed >>> 5) % 21) - 10) * 0.009;
    const center = this._applyZoomOutSpread(region.x, region.y);
    const spreadRadius = this._scaleZoomOutDistance(radius);

    _ctx.beginPath();
    for (let index = 0; index <= points; index++) {
      const angle = index * (Math.PI * 2 / points);
      const organic = 1
        + Math.sin(angle * 3 + seedA) * 0.075
        + Math.cos(angle * 5 + seedB) * 0.045;
      const x = center.x + Math.cos(angle) * spreadRadius * xScale * organic;
      const y = center.y + Math.sin(angle) * spreadRadius * yScale * organic;
      if (index === 0) _ctx.moveTo(x, y);
      else _ctx.lineTo(x, y);
    }
    _ctx.closePath();
    _ctx.fillStyle = `hsla(${hue}, 86%, 45%, ${fillAlpha})`;
    _ctx.fill();
    _ctx.strokeStyle = `hsla(${hue}, 95%, 62%, ${strokeAlpha})`;
    _ctx.lineWidth = Math.max(1, 1.35 / Math.max(this._viewTransform.k, 0.0005));
    _ctx.stroke();

    _ctx.globalAlpha = Math.min(0.20, strokeAlpha * 0.52);
    _ctx.beginPath();
    _ctx.ellipse(center.x, center.y, spreadRadius * xScale * 0.58, spreadRadius * yScale * 0.45, seedA * 0.12, 0, Math.PI * 2);
    _ctx.strokeStyle = `hsla(${hue}, 95%, 68%, 1)`;
    _ctx.lineWidth = Math.max(0.8, 0.9 / Math.max(this._viewTransform.k, 0.0005));
    _ctx.stroke();
    _ctx.globalAlpha = 1;
  }

  private _drawGroupRegionLabel(
    _ctx: CanvasRenderingContext2D,
    region: GroupRegion,
    zoom: number,
    hue: number,
    visibility: number
  ): void {
    const previousAlpha = _ctx.globalAlpha;
    const safeZoom = Math.max(zoom, 0.0005);
    const label = region.label.length > 26 ? `${region.label.slice(0, 24)}...` : region.label;
    const fontSize = Math.max(10, Math.min(16, 10 + region.importance * 5)) / safeZoom;
    const center = this._applyZoomOutSpread(region.x, region.y);

    _ctx.globalAlpha = Math.min(0.82, visibility * 0.62);
    _ctx.font = `800 ${fontSize}px JetBrains Mono, monospace`;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillStyle = `hsla(${hue}, 95%, 74%, 1)`;
    _ctx.fillText(label.toUpperCase(), center.x, center.y);
    _ctx.font = `700 ${Math.max(8, fontSize * safeZoom * 0.72) / safeZoom}px JetBrains Mono, monospace`;
    _ctx.fillStyle = `hsla(${hue}, 95%, 78%, 0.68)`;
    _ctx.fillText(`${region.memberCount} nodes`, center.x, center.y + fontSize * 1.05);
    _ctx.globalAlpha = previousAlpha;
  }

  private _groupRegionVisibility(zoom: number): number {
    if (zoom >= 0.92) return 0;
    if (zoom <= 0.16) return 1;
    return this._smoothStep(this._clamp01((0.92 - zoom) / 0.76));
  }

  private _subgroupRegionVisibility(zoom: number): number {
    if (zoom >= 0.72) return 0;
    if (zoom <= 0.20) return 0.72;
    return 0.72 * this._smoothStep(this._clamp01((0.72 - zoom) / 0.52));
  }

  private _isGroupRegionInBounds(region: GroupRegion, bounds: ViewBounds): boolean {
    const center = this._applyZoomOutSpread(region.x, region.y);
    const radius = this._scaleZoomOutDistance(region.radius * 1.22);
    return center.x + radius >= bounds.left
      && center.x - radius <= bounds.right
      && center.y + radius >= bounds.top
      && center.y - radius <= bounds.bottom;
  }

  private _groupRegionHue(seed: number): number {
    const palette = [188, 164, 204, 138, 48, 220, 174, 198];
    return palette[seed % palette.length];
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
      const alpha = (isFocusActive ? 0.085 : 0.12) * intensity;
      const position = this._getDisplayPosition(node);

      _ctx.beginPath();
      _ctx.arc(position.x, position.y, radius / Math.max(zoom, 0.35), 0, Math.PI * 2);
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
    const sourcePosition = this._getDisplayPosition(source);
    const targetPosition = this._getDisplayPosition(target);
    if (!this._isLinkPositionInBounds(sourcePosition, targetPosition, bounds)) return false;

    const sourceOriginal = {x: source.x, y: source.y};
    const targetOriginal = {x: target.x, y: target.y};
    source.x = sourcePosition.x;
    source.y = sourcePosition.y;
    target.x = targetPosition.x;
    target.y = targetPosition.y;

    try {
      let linkOpacity = 0.6;
      if (isFocusActive) {
        const activeFocusNode = this._getActiveFocusNode();
        const isRelated = activeFocusNode && (link.sourceId === activeFocusNode.id || link.targetId === activeFocusNode.id);
        if (!isRelated) linkOpacity = this._lerp(1.0, FOCUS_DIM_LINK_OPACITY, this._currentFocusLevel);
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
      } else if (link.type === 'aggregate-dependency') {
        this._drawAggregateDependencyLink(_ctx, source, target, link, zoom, linkOpacity);
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
    } finally {
      source.x = sourceOriginal.x;
      source.y = sourceOriginal.y;
      target.x = targetOriginal.x;
      target.y = targetOriginal.y;
    }
  }

  private _drawAggregateDependencyLink(
    _ctx: CanvasRenderingContext2D,
    source: RenderNode,
    target: RenderNode,
    link: RenderLink,
    zoom: number,
    linkOpacity: number
  ): void {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const hash = this._stableHash(link.uniqueId);
    const direction = (hash & 1) === 0 ? 1 : -1;
    const curve = Math.min(220, Math.max(34, distance * 0.12)) * direction;
    const controlX = (source.x + target.x) / 2 + normalX * curve;
    const controlY = (source.y + target.y) / 2 + normalY * curve;
    const weight = Math.max(1, link.weight ?? 1);
    const intensity = Math.min(1, Math.log2(weight + 1) / 9);

    _ctx.beginPath();
    _ctx.moveTo(source.x, source.y);
    _ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
    _ctx.strokeStyle = `rgba(20, 184, 166, ${0.12 + intensity * 0.28})`;
    _ctx.globalAlpha = linkOpacity * (0.46 + intensity * 0.32);
    _ctx.lineWidth = Math.max(1.1, 1.2 + intensity * 4.4) / Math.max(zoom, 0.0005);
    _ctx.stroke();

    if (intensity > 0.35) {
      _ctx.globalAlpha = linkOpacity * 0.14 * intensity;
      _ctx.beginPath();
      _ctx.moveTo(source.x, source.y);
      _ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
      _ctx.strokeStyle = '#5eead4';
      _ctx.lineWidth = Math.max(2.8, 4.8 * intensity) / Math.max(zoom, 0.0005);
      _ctx.stroke();
    }
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
    if (overview <= 0) return baseRadius * this._detailScale(zoom);

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

    return Math.max(baseRadius * this._detailScale(zoom), screenRadius / safeZoom);
  }

  private _overviewFactor(zoom: number): number {
    if (zoom >= 0.72) return 0;
    if (zoom <= 0.20) return 1;
    return Math.max(0, Math.min(1, (0.72 - zoom) / 0.52));
  }

  private _detailScale(zoom: number): number {
    const factor = this._smoothStep(
      this._clamp01((zoom - DETAIL_SHRINK_ZOOM_START) / (DETAIL_SHRINK_ZOOM_END - DETAIL_SHRINK_ZOOM_START))
    );
    return this._lerp(1, DETAIL_MIN_SCALE, factor);
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
    const displayPosition = this._getDisplayPosition(node);
    const originalX = node.x;
    const originalY = node.y;
    node.x = displayPosition.x;
    node.y = displayPosition.y;

    if (isFocusActive) {
      const isNeighbor = this._focusedNodeIds.has(node.id);
      if (!isHighlight && !isNeighbor) {
        nodeOpacity = this._lerp(1.0, FOCUS_DIM_NODE_OPACITY, this._currentFocusLevel);
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

    node.x = originalX;
    node.y = originalY;
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

    const fontSize = this._labelScreenFontSizePx(zoom, isHighlight) / Math.max(zoom, 0.0005);
    _ctx.font = `${isHighlight ? 'bold' : ''} ${fontSize}px "JetBrains Mono"`;
    _ctx.textAlign = 'center';
    _ctx.fillText(node.meta?.label || '', node.x, yPos);
  }

  private _labelScreenFontSizePx(zoom: number, isHighlight: boolean): number {
    const baseSize = Math.max(9 * zoom, 11);
    const detailScale = this._detailScale(zoom);
    const highlightScale = isHighlight ? this._lerp(detailScale, 1, 0.35) : detailScale;
    return baseSize * highlightScale;
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
