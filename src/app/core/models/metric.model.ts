export interface LiveMetric {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly icon: string;
  readonly accent: string;
  value: number;
  /** Percentage change vs the previous tick. */
  trend: number;
  /** Recent samples for the sparkline. */
  history: number[];
}

export interface MetricSnapshot {
  readonly id: string;
  readonly value: number;
  readonly at: number;
}
