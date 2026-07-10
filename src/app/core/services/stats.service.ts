import { Injectable, computed, inject } from '@angular/core';
import { FeatureCatalogService } from './feature-catalog.service';
import { TelemetryService } from './telemetry.service';

export interface HeadlineStat {
  readonly label: string;
  readonly value: number;
  readonly suffix: string;
  readonly accent: string;
}

/**
 * Derives the hero's headline numbers from the catalog + live telemetry. Injecting
 * both services gives the DI graph a nice fan-in (StatsService depends on two).
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly catalog = inject(FeatureCatalogService);
  private readonly telemetry = inject(TelemetryService);

  readonly headline = computed<HeadlineStat[]>(() => [
    { label: 'Angular majors', value: 5, suffix: '', accent: 'var(--cyan)' },
    { label: 'Inspector views', value: this.catalog.count(), suffix: '', accent: 'var(--indigo)' },
    { label: 'Live resolutions', value: Math.round(this.telemetry.resolutions() / 1000), suffix: 'k/s', accent: 'var(--violet)' },
    { label: 'Runtime cost', value: 0, suffix: 'ms', accent: 'var(--magenta)' },
  ]);
}
