import {RenderNode} from '../../models/constellation.models';
import {clamp01, lerp, smoothStep} from './render-math';

// Detail (close-zoom) shrink curve: past DETAIL_SHRINK_ZOOM_START nodes scale down toward DETAIL_MIN_SCALE
// so a deeply zoomed-in view doesn't fill with oversized shapes.
const DETAIL_SHRINK_ZOOM_START = 2.2;
const DETAIL_SHRINK_ZOOM_END = 5.8;
const DETAIL_MIN_SCALE = 0.56;

/** Graph-wide facts the visual model needs but doesn't own. */
export interface NodeVisualsDeps {
  /** Cross-injector dependency degree of a node (0 when unknown) — drives importance. */
  degreeOf(nodeId: string): number;
  /** Total rendered node count (label thresholds tighten as the graph grows). */
  nodeCount(): number;
  isHugeGraph(): boolean;
}

/**
 * The visual model of a node: how important it is, how large it draws at a given zoom, and when its
 * label appears. Pure given its {@link NodeVisualsDeps} — shared by the node renderer, the region
 * renderer, and the engine's group-region builder so every consumer sizes and prioritises nodes the same
 * way.
 */
export class NodeVisuals {
  constructor(private readonly _deps: NodeVisualsDeps) {}

  /** Node prominence in [0, 1]: root = 1, else an explicit hint or a log curve over dependency degree. */
  importance(node: RenderNode): number {
    if (node.meta?.isRoot) return 1;
    const explicitImportance = node.meta?.importance;
    if (typeof explicitImportance === 'number') return Math.max(0, Math.min(1, explicitImportance));

    const degree = this._deps.degreeOf(node.id);
    return Math.max(0.08, Math.min(1, Math.log2(degree + 1) / 8));
  }

  /**
   * The radius (world units) to draw a node at the given zoom. Zoomed in it tracks the node's true
   * radius (with the detail-shrink curve); zoomed out it blends toward a fixed on-screen size tiered by
   * importance, so an overview stays legible without giant shapes.
   */
  visualRadius(node: RenderNode, zoom: number): number {
    const baseRadius = node.radius;
    const overview = this.overviewFactor(zoom);
    if (overview <= 0) return baseRadius * this.detailScale(zoom);

    const safeZoom = Math.max(zoom, 0.0005);
    const isInjector = node.type === 'injector';
    const isRoot = !!node.meta?.isRoot;
    const unusedFactor = node.meta?.isUnused ? 0.74 : 1;
    const tierScale = this.overviewTierScale(node);
    const baseScreenRadius = baseRadius * zoom;
    const fullScreenRadius = isInjector ? (isRoot ? 16 : 13) : 8.5 * unusedFactor;
    const tieredScreenRadius = Math.max(isInjector ? 3.5 : 2.1, fullScreenRadius * tierScale);
    const stepBoost = this.overviewStepBoost(zoom, tierScale, isRoot);
    const targetScreenRadius = tieredScreenRadius + stepBoost;
    const screenRadius = lerp(baseScreenRadius, targetScreenRadius, overview);

    return Math.max(baseRadius * this.detailScale(zoom), screenRadius / safeZoom);
  }

  /** How "zoomed out" the view is in [0, 1] (1 = far out, 0 at/above the detail zoom). */
  overviewFactor(zoom: number): number {
    if (zoom >= 0.72) return 0;
    if (zoom <= 0.20) return 1;
    return Math.max(0, Math.min(1, (0.72 - zoom) / 0.52));
  }

  /** Close-zoom shrink factor in [DETAIL_MIN_SCALE, 1]. */
  detailScale(zoom: number): number {
    const factor = smoothStep(
      clamp01((zoom - DETAIL_SHRINK_ZOOM_START) / (DETAIL_SHRINK_ZOOM_END - DETAIL_SHRINK_ZOOM_START))
    );
    return lerp(1, DETAIL_MIN_SCALE, factor);
  }

  /** Overview size tier by importance (root largest, trivial nodes smallest). */
  overviewTierScale(node: RenderNode): number {
    if (node.meta?.isRoot) return 1;

    const importance = this.importance(node);
    if (importance >= 0.82) return 0.75;
    if (importance >= 0.52) return 0.5;
    return 0.25;
  }

  /** Extra world-radius bump for prominent nodes at very low zoom, so key nodes stay visible. */
  overviewStepBoost(zoom: number, tierScale: number, isRoot: boolean): number {
    let boost = 0;
    if (zoom < 0.42 && tierScale >= 0.5) boost += 1.2;
    if (zoom < 0.24 && tierScale >= 0.75) boost += 1.6;
    if (zoom < 0.12 && (tierScale >= 0.75 || isRoot)) boost += 1.8;
    if (zoom < 0.06 && isRoot) boost += 2.2;
    return boost;
  }

  /** On-screen label font size (px) at a zoom, slightly enlarged for the highlighted node. */
  labelScreenFontSize(zoom: number, isHighlight: boolean): number {
    const baseSize = Math.max(9 * zoom, 11);
    const detailScale = this.detailScale(zoom);
    const highlightScale = isHighlight ? lerp(detailScale, 1, 0.35) : detailScale;
    return baseSize * highlightScale;
  }

  /** Whether regular labels should render at this zoom (given the node's minimum-zoom gate). */
  shouldRenderLabels(zoom: number, minZoom: number): boolean {
    return zoom > this.labelRenderThreshold(minZoom);
  }

  /** Whether a node earns a beacon label while zoomed out (root, or high importance). */
  shouldRenderOverviewLabel(node: RenderNode, zoom: number): boolean {
    if (zoom > 0.34) return false;
    if (node.meta?.isRoot) return true;

    const importance = this.importance(node);
    if (node.type === 'injector') return importance >= 0.92;
    return importance >= 0.97;
  }

  /** Minimum zoom at which labels appear, raised as the graph grows to avoid label spam. */
  labelRenderThreshold(minZoom: number): number {
    const count = this._deps.nodeCount();
    if (this._deps.isHugeGraph()) return minZoom + 1.45;
    if (count > 3000) return minZoom + 1.1;
    if (count > 1000) return minZoom + 0.55;
    return minZoom;
  }
}
