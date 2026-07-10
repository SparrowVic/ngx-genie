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
  readonly value: number;
  readonly unit?: string;
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
  /** Version the feature was introduced. */
  readonly since: string;
  readonly bullets: readonly string[];
  readonly stats: readonly FeatureStat[];
  /** Short pseudo/code snippet shown on the feature spotlight. */
  readonly demo: string;
}
