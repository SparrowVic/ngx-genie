export type FeatureId =
  | 'tree'
  | 'org-chart'
  | 'matrix'
  | 'constellation'
  | 'diagnostics'
  | 'inspector'
  | 'deep-focus';

export interface FeatureStat {
  readonly label: string;
  /** A real fact — a count (rendered with a count-up) or a short qualitative string. */
  readonly value: string | number;
  readonly unit?: string;
}

/**
 * A real product capture of the view — GenieOS inspecting this very site —
 * rendered as the spotlight's framed screenshot.
 */
export interface FeatureMedia {
  /** Site-relative URL, e.g. '/media/tree-view.png'. */
  readonly src: string;
  /** Meaningful description of what the capture shows. */
  readonly alt: string;
  /** Intrinsic pixel width — reserved in the layout to avoid CLS. */
  readonly width: number;
  /** Intrinsic pixel height — reserved in the layout to avoid CLS. */
  readonly height: number;
  /** Optional one-line caption shown under the frame. */
  readonly caption?: string;
}

export interface GenieFeature {
  readonly id: FeatureId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  /** Icon key resolved by the shared IconComponent. */
  readonly icon: string;
  /** CSS colour, e.g. 'var(--violet)'. */
  readonly accent: string;
  readonly bullets: readonly string[];
  readonly stats: readonly FeatureStat[];
  /** Short pseudo/code snippet shown on the feature spotlight. */
  readonly demo: string;
  /** Real screenshot of the view in action, shown as a framed product shot. */
  readonly media?: FeatureMedia;
}
