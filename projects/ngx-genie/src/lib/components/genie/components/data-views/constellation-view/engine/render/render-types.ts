import {
  ConstellationLinkRenderMode,
  LinkAnimState,
  RenderLink,
  RenderNode
} from '../../models/constellation.models';

/** A world-space rectangle (with culling margin already applied) describing what the viewport covers. */
export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A world-space point a node is drawn at (its live position, or a transition/lens override). */
export interface DisplayPosition {
  x: number;
  y: number;
}

/** The links visible this frame, bucketed by type (built for huge graphs to bound per-frame link work). */
export interface VisibleLinkCandidates {
  providerLinks: RenderLink[];
  dependencyLinks: RenderLink[];
  componentLinks: RenderLink[];
  aggregateLinks: RenderLink[];
}

/** A drawn cluster halo behind a group (or subgroup) of nodes in the organic layout. */
export interface GroupRegion {
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

/**
 * The per-frame view snapshot handed to every renderer. Rebuilt once at the top of each frame by the
 * engine; carries only values (no live engine references) so a renderer's draw call is a pure function
 * of this context plus the {@link RenderScene} it was constructed with.
 */
export interface FrameContext {
  ctx: CanvasRenderingContext2D;
  /** Current camera zoom (world→screen scale). */
  zoom: number;
  /** Camera translation in screen pixels. */
  tx: number;
  ty: number;
  /** Visible world-space rectangle (with culling margin). */
  bounds: ViewBounds;
  /** Animation clock (performance.now() at frame start). */
  time: number;
  /** Milliseconds since the previous frame (clamped). */
  frameDelta: number;
  /** Whether focus mode is currently dimming non-focused nodes/links. */
  isFocusActive: boolean;
  /** Eased focus strength in [0, 1] (drives dim opacity). */
  focusLevel: number;
  /** Ids of the focused node and its neighbours (kept fully lit when focus is active). */
  focusedNodeIds: Set<string>;
  /** The node focus is centred on (hovered/pinned), or null when focus is inactive. */
  activeFocusNode: RenderNode | null;
  hoveredNode: RenderNode | null;
  pinnedNode: RenderNode | null;
  /** FX master switch (energy flows, pulses). */
  animationsEnabled: boolean;
  /** True when time-based visuals should animate: FX on AND the layout is live (force). */
  animateVisuals: boolean;
  linkRenderMode: ConstellationLinkRenderMode;
  /** True for atlas/organic layouts (position-frozen). */
  staticLayout: boolean;
  /** True for very large graphs (drives link/label budgets). */
  hugeGraph: boolean;
}

/**
 * The stable, engine-owned data and position helpers a renderer reads. Passed once at construction (the
 * engine implements it), so renderers see live graph data across frames without rebuilding it. Anything
 * that changes per frame belongs in {@link FrameContext} instead.
 */
export interface RenderScene {
  readonly renderNodes: Map<string, RenderNode>;
  readonly renderLinks: RenderLink[];
  readonly linksByNodeId: Map<string, RenderLink[]>;
  readonly linkAnimStates: Map<string, LinkAnimState>;
  readonly dependencyDegreeByNodeId: Map<string, number>;
  readonly groupRegions: GroupRegion[];
  readonly subgroupRegions: GroupRegion[];
  readonly unusedPattern: CanvasPattern | null;
  /** Bumped whenever graph data changes — part of the visible-link candidate cache key. */
  readonly renderDataVersion: number;
  /** Identity of the last computed renderable-node set — part of the candidate cache key. */
  readonly renderableNodesKey: string;

  /** The world-space point a node should be drawn at (honours layout transitions / zoom-out spread). */
  getDisplayPosition(node: RenderNode): DisplayPosition;
  /** Re-project a world point outward by the current zoom-out spread (identity while spread is 1). */
  applyZoomOutSpread(x: number, y: number): DisplayPosition;
  /** Scale a world distance by the current zoom-out spread (identity while spread is 1). */
  scaleZoomOutDistance(value: number): number;
}
