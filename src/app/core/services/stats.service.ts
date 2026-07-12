import { Injectable, computed, inject } from '@angular/core';
import { FeatureCatalogService } from './feature-catalog.service';

export interface HeadlineStat {
  readonly label: string;
  readonly value: number;
  readonly suffix: string;
  readonly accent: string;
}

/**
 * The hero's headline numbers — all verifiable facts about GenieOS. The inspector-view
 * count is derived from the feature catalog; the rest are fixed, confirmable figures.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly catalog = inject(FeatureCatalogService);

  readonly headline = computed<HeadlineStat[]>(() => [
    { label: 'Inspector views', value: this.catalog.count(), suffix: '', accent: 'var(--cyan)' },
    { label: 'Provider types', value: 9, suffix: '', accent: 'var(--indigo)' },
    { label: 'Diagnostic checks', value: 8, suffix: '', accent: 'var(--violet)' },
    { label: 'Web Workers', value: 2, suffix: '', accent: 'var(--magenta)' },
  ]);
}
