import {RenderLink, RenderNode} from '../models/constellation.models';

// -----------------------------------------------------------------------------------------------
// DISABLED SUBSYSTEM — the relation-ring / viewport-lens layout.
//
// This code re-projected a graph's nodes when zoomed out: packing injector "parents" into clusters
// and fanning their related children into concentric rings, then resolving collisions, so a zoomed-out
// overview stayed legible. It is currently DISABLED at the source: ConstellationEngine's
// _targetZoomOutSpreadScale() returns a constant 1 (see the comment there), which pins the spread scale
// to 1, leaves _displayPositions permanently empty, and means none of the methods below are ever
// invoked. Nothing in the engine (or anywhere else) instantiates RelationRingLayout.
//
// It is kept here — out of the live render engine — as reference in case the lens is revived. If you
// bring it back, implement a RelationRingLayoutHost and call _advanceDisplayPosition /
// _buildRelationalLensTargets from the render loop again. The engine still provides most of the host
// surface; a few trivial pure helpers it used to own (_worldToScreen, _mixAngles, _closeZoomFactor,
// _relationCompactFactor) were removed from the engine when this was quarantined and would need
// re-adding (their original bodies are recoverable from git history).
// -----------------------------------------------------------------------------------------------

interface DisplayPosition {
  x: number;
  y: number;
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

interface CollisionNode {
  node: RenderNode;
  movable: boolean;
  radius: number;
  x: number;
  y: number;
}

interface VisibleLinkCandidates {
  providerLinks: RenderLink[];
  dependencyLinks: RenderLink[];
  componentLinks: RenderLink[];
  aggregateLinks: RenderLink[];
}

const VIEWPORT_LENS_MAX_NODES = 720;
const VIEWPORT_LENS_MIN_ZOOM = 0.08;
const VIEWPORT_LENS_MAX_STRENGTH = 0.94;
const VIEWPORT_LENS_MIN_STEP_PX = 4;
const VIEWPORT_LENS_MAX_STEP_PX = 18;
const VIEWPORT_CLUSTER_PACKING_MAX_CLUSTERS = 96;
const VIEWPORT_PARENT_PACKING_MAX_CLUSTERS = 360;
const VIEWPORT_CLUSTER_PACKING_MIN_SPREAD = 0.26;
const VIEWPORT_CLUSTER_PACKING_TARGET_SCALE = 0.30;
const VIEWPORT_CLUSTER_OVERVIEW_TARGET_SCALE = 0.20;
const RELATION_RING_FIRST_RADIUS_PX = 118;
const RELATION_RING_GAP_PX = 86;
const RELATION_RING_MIN_SPACING_PX = 68;
const COLLISION_GRID_MIN_CELL_PX = 72;

/**
 * The engine-side members the (disabled) relation-ring lens reads — documenting the coupling surface so
 * the subsystem can live in its own file. ConstellationEngine provides most of these; the four pure
 * helpers noted in the file header were removed from it during quarantine. Not implemented anywhere
 * today because the lens is never instantiated.
 */
export interface RelationRingLayoutHost {
  _width: number;
  _height: number;
  _renderNodes: Map<string, RenderNode>;
  _providerLinks: RenderLink[];
  _componentLinks: RenderLink[];
  _relationChildIdsByParentId: Map<string, string[]>;
  _relationSlotCache: Map<string, RelationSlot>;
  _relationGroupSignatures: Map<string, string>;

  _lerp(start: number, end: number, t: number): number;
  _clamp01(value: number): number;
  _smoothStep(value: number): number;
  _mixAngles(from: number, to: number, t: number): number;
  _stableHash(value: string): number;
  _closeZoomFactor(zoom: number): number;
  _relationCompactFactor(zoom: number): number;
  _worldToScreen(position: DisplayPosition): DisplayPosition;
  _overviewFactor(zoom: number): number;
  _labelScreenFontSizePx(zoom: number, isHighlight: boolean): number;
  _labelRenderThreshold(minZoom: number): number;
  _getVisualRadius(node: RenderNode, zoom: number): number;
  _getNodeImportance(node: RenderNode): number;
  _shouldRenderOverviewLabel(node: RenderNode, zoom: number): boolean;
  _isStaticLayout(): boolean;
  _isHugeGraph(): boolean;
}

/**
 * DISABLED — see the file header. Historic relation-ring / viewport-lens layout, preserved as reference.
 * Every engine helper it needs is read through {@link RelationRingLayoutHost}; nothing instantiates it.
 */
export class RelationRingLayout {
  constructor(private readonly _host: RelationRingLayoutHost) {}

  private _advanceDisplayPosition(
    current: DisplayPosition,
    target: DisplayPosition,
    ease: number,
    zoom: number,
    frameDelta: number
  ): DisplayPosition {
    const next = {
      x: this._host._lerp(current.x, target.x, ease),
      y: this._host._lerp(current.y, target.y, ease)
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
    const closeZoom = this._host._closeZoomFactor(zoom);
    const pixelsPerSecond = this._host._lerp(1040, 640, closeZoom);
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
    if (!this._host._isStaticLayout()) return targets;
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
    const providerLinks = visibleLinkCandidates?.providerLinks ?? this._host._providerLinks;
    const componentLinks = visibleLinkCandidates?.componentLinks ?? this._host._componentLinks;
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
      parentNodes.sort((a, b) => this._host._getNodeImportance(b) - this._host._getNodeImportance(a));
      parentNodes.length = VIEWPORT_PARENT_PACKING_MAX_CLUSTERS;
    }

    for (const node of parentNodes) {
      const position = targets.get(node.id) ?? node;
      const screenPosition = this._host._worldToScreen(position);
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

    const centerX = this._host._width * 0.5;
    const centerY = this._host._height * 0.5;
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

    const centerX = this._host._width * 0.5;
    const centerY = this._host._height * 0.5;
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
      const parentScreenPosition = this._host._worldToScreen(parentPosition);
      let radius = this._parentOverviewFootprintRadiusPx(parent, children.length, zoom);

      for (const member of members) {
        const position = targets.get(member.id) ?? member;
        const screenPosition = this._host._worldToScreen(position);
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
      const screenPosition = this._host._worldToScreen(position);
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
    const relationChildCount = this._host._relationChildIdsByParentId.get(parent.id)?.length ?? 0;
    const childCount = Math.max(visibleChildCount, relationChildCount);
    if (childCount <= 0) return base;

    const overview = this._host._overviewFactor(zoom);
    const parentFootprint = this._relationLayoutFootprintRadiusPx(parent, zoom);
    const childFootprint = Math.max(
      RELATION_RING_MIN_SPACING_PX * 0.5,
      this._host._lerp(26, 42, this._host._clamp01(childCount / 28))
    );
    const ringIndex = Math.max(0, Math.ceil(childCount / Math.max(1, this._relationRingCapacity(
      this._relationRingRadiusPx(0, parentFootprint, childFootprint),
      childFootprint
    ))) - 1);
    const relationRadius = this._relationRingRadiusPx(ringIndex, parentFootprint, childFootprint)
      * this._relationRingCompactionScale(zoom, childCount);
    const hiddenChildrenRadius = base + Math.min(96, 18 + Math.sqrt(childCount) * 8.5);
    const footprintRelaxation = this._host._lerp(0.82, 0.70, overview);
    const relaxedBase = base * this._host._lerp(0.84, 0.74, overview);

    return Math.max(
      relaxedBase,
      this._host._lerp(relationRadius, hiddenChildrenRadius, overview * 0.92) * footprintRelaxation
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

    const viewportArea = Math.max(1, this._host._width * this._host._height);
    const occupancy = this._host._clamp01(area / viewportArea);
    const spread = Math.max(
      (right - left) / Math.max(1, this._host._width),
      (bottom - top) / Math.max(1, this._host._height)
    );
    const sparseFactor = 1 - this._host._smoothStep(this._host._clamp01((occupancy - 0.24) / 0.38));
    const spreadFactor = this._host._smoothStep(this._host._clamp01((spread - VIEWPORT_CLUSTER_PACKING_MIN_SPREAD) / 0.52));
    const countFactor = this._host._lerp(1, 0.78, this._host._clamp01((clusters.length - 8) / 56));
    const pull = sparseFactor * spreadFactor * countFactor;
    if (pull <= 0.04) return 1;

    const targetScale = this._host._lerp(
      VIEWPORT_CLUSTER_PACKING_TARGET_SCALE,
      VIEWPORT_CLUSTER_OVERVIEW_TARGET_SCALE,
      this._host._overviewFactor(zoom)
    );
    const desiredScale = this._host._lerp(1, targetScale, pull);
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
    const compactFactor = this._host._relationCompactFactor(zoom);
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
        x: this._host._lerp(childOrigin.x, ringTarget.x, targetStrength),
        y: this._host._lerp(childOrigin.y, ringTarget.y, targetStrength)
      });
    }
  }

  private _getRelationSlotChildren(parentId: string, fallbackChildren: RenderNode[]): RenderNode[] {
    const childIds = this._host._relationChildIdsByParentId.get(parentId);
    if (!childIds?.length) return fallbackChildren;

    const children: RenderNode[] = [];
    for (const childId of childIds) {
      const child = this._host._renderNodes.get(childId);
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
    const cachedSignature = this._host._relationGroupSignatures.get(parent.id);
    if (cachedSignature === signature) {
      return this._readRelationSlots(parent.id, orderedChildren);
    }

    this._host._relationGroupSignatures.set(parent.id, signature);
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
        this._host._relationSlotCache.set(
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
      const slot = this._host._relationSlotCache.get(this._relationSlotKey(parentId, child.id));
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
    const compactFactor = this._host._relationCompactFactor(zoom);
    if (compactFactor <= 0.01) return {center: 0, span: Math.PI * 2, strength: 0};

    const parentScreen = this._host._worldToScreen(parentTarget);
    const viewportCenter = {x: this._host._width * 0.5, y: this._host._height * 0.5};
    let forceX = parentScreen.x - viewportCenter.x;
    let forceY = parentScreen.y - viewportCenter.y;
    const viewportDiagonal = Math.hypot(this._host._width, this._host._height);
    const centerDistance = Math.hypot(forceX, forceY);

    if (centerDistance < viewportDiagonal * 0.08) {
      const hashAngle = (this._host._stableHash(parent.id) % 6283) / 1000;
      forceX += Math.cos(hashAngle) * viewportDiagonal * 0.08;
      forceY += Math.sin(hashAngle) * viewportDiagonal * 0.08;
    }

    for (const node of visibleNodes.values()) {
      if (node.id === parent.id || node.type !== 'injector') continue;

      const screen = this._host._worldToScreen(targets.get(node.id) ?? node);
      const dx = parentScreen.x - screen.x;
      const dy = parentScreen.y - screen.y;
      const distance = Math.max(80, Math.hypot(dx, dy));
      if (distance > 520) continue;

      const weight = (520 - distance) / 520;
      forceX += (dx / distance) * weight * viewportDiagonal * 0.18;
      forceY += (dy / distance) * weight * viewportDiagonal * 0.18;
    }

    const crowdFactor = this._viewportParentCrowdFactor(visibleNodes);
    const childFactor = this._host._clamp01((childCount - 1) / 14);
    const strength = compactFactor * this._host._lerp(0.74, 1, crowdFactor);
    const span = this._host._lerp(
      Math.PI * 2,
      this._host._lerp(Math.PI * 0.42, Math.PI * 0.58, childFactor),
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
    return this._host._mixAngles(slot.angle, sectorAngle, strength);
  }

  private _viewportParentCrowdFactor(visibleNodes: Map<string, RenderNode>): number {
    let injectorCount = 0;
    for (const node of visibleNodes.values()) {
      if (node.type === 'injector') injectorCount++;
    }

    const viewportArea = Math.max(1, this._host._width * this._host._height);
    const density = injectorCount / viewportArea * 1000000;
    return this._host._smoothStep(this._host._clamp01((density - 8) / 42));
  }

  private _relationLayoutFootprintRadiusPx(node: RenderNode, zoom: number): number {
    const footprint = this._nodeFootprintRadiusPx(node, zoom);
    const visualRadius = this._host._getVisualRadius(node, zoom) * zoom;
    const compactFactor = this._host._relationCompactFactor(zoom);
    const compactFootprint = Math.max(
      this._relationSlotFootprintRadiusPx(node),
      visualRadius + (node.type === 'injector' ? 18 : 14),
      footprint * (node.type === 'injector' ? 0.52 : 0.46)
    );

    return this._host._lerp(footprint, compactFootprint, compactFactor);
  }

  private _relationRingCompactionScale(zoom: number, childCount: number): number {
    const compactFactor = this._host._relationCompactFactor(zoom);
    const denseGroupRecovery = this._host._clamp01((childCount - 18) / 40) * 0.18;
    const targetScale = 0.20 + denseGroupRecovery;
    return this._host._lerp(1, targetScale, compactFactor);
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
    const distanceFactor = this._host._clamp01((avgDistancePx - idealDistance * 0.72) / Math.max(1, idealDistance * 2.2));
    const groupFactor = this._host._clamp01((children.length - 1) / 10);
    const zoomFactor = this._host._smoothStep(this._host._clamp01((zoom - VIEWPORT_LENS_MIN_ZOOM) / 0.24));

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
      const hash = this._host._stableHash(`${a.node.id}:${b.node.id}`);
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
    const visualRadiusPx = this._host._getVisualRadius(node, zoom) * zoom;
    const labelFactor = this._labelFootprintFactor(node, zoom);
    if (labelFactor <= 0.01) return visualRadiusPx + 12;

    const label = node.meta?.label ?? '';
    const fontSizePx = this._host._labelScreenFontSizePx(zoom, false);
    const labelWidth = Math.min(340, label.length * fontSizePx * 0.62);
    const labelRadius = Math.max(
      visualRadiusPx + 14,
      labelWidth * 0.5 + 16
    );

    return this._host._lerp(visualRadiusPx + 12, labelRadius, labelFactor);
  }

  private _nodeCollisionRadiusPx(node: RenderNode, zoom: number): number {
    const footprint = this._nodeFootprintRadiusPx(node, zoom);
    const visualRadius = this._host._getVisualRadius(node, zoom) * zoom;
    const closeZoom = this._host._closeZoomFactor(zoom);
    const compactRadius = Math.max(
      this._relationSlotFootprintRadiusPx(node),
      visualRadius + (node.type === 'injector' ? 16 : 12),
      footprint * (node.type === 'injector' ? 0.76 : 0.68)
    );

    return this._host._lerp(footprint, compactRadius, closeZoom);
  }

  private _collisionGapPx(zoom: number): number {
    return this._host._lerp(10, 5, this._host._closeZoomFactor(zoom));
  }

  private _labelFootprintFactor(node: RenderNode, zoom: number): number {
    if (this._host._shouldRenderOverviewLabel(node, zoom)) return 0.72;

    const minZoom = node.type === 'injector' ? 0.6 : 0.8;
    const threshold = this._host._labelRenderThreshold(minZoom);
    return this._host._smoothStep(this._host._clamp01((zoom - (threshold - 0.36)) / 0.72));
  }

}
