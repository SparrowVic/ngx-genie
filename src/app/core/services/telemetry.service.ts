import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FEATURE_FLAGS } from '../tokens/feature-flags.token';
import { LiveMetric } from '../models/metric.model';

/**
 * Simulated live telemetry for the "observatory" dashboards. Depends on the
 * FEATURE_FLAGS token (value provider) — a nice mixed dependency for the DI graph.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly flags = inject(FEATURE_FLAGS);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _metrics = signal<LiveMetric[]>(this.seed());
  readonly metrics = this._metrics.asReadonly();
  readonly isLive = signal(false);

  readonly resolutions = computed(
    () => this._metrics().find((m) => m.id === 'resolutions')?.value ?? 0,
  );
  readonly averageTrend = computed(() => {
    const list = this._metrics();
    return list.reduce((sum, m) => sum + m.trend, 0) / (list.length || 1);
  });
  readonly rising = computed(() => this._metrics().filter((m) => m.trend > 0).length);

  constructor() {
    if (this.isBrowser && this.flags.liveMetrics) {
      this.isLive.set(true);
      const id = setInterval(() => this.tick(), 1600);
      this.destroyRef.onDestroy(() => clearInterval(id));
    }
  }

  private tick(): void {
    this._metrics.update((list) =>
      list.map((m) => {
        const delta = (Math.random() - 0.42) * Math.max(m.value, 12) * 0.05;
        const value = Math.max(0, Math.round(m.value + delta));
        const trend = m.value === 0 ? 0 : ((value - m.value) / m.value) * 100;
        const history = [...m.history.slice(-23), value];
        return { ...m, value, trend: +trend.toFixed(1), history };
      }),
    );
  }

  private seed(): LiveMetric[] {
    return [
      { id: 'resolutions', label: 'DI resolutions / s', unit: '', icon: 'bolt', accent: 'var(--cyan)', value: 18420, trend: 2.1, history: this.wave(18000, 24) },
      { id: 'injectors', label: 'Live injectors', unit: '', icon: 'layers', accent: 'var(--indigo)', value: 342, trend: 0.8, history: this.wave(320, 24) },
      { id: 'depth', label: 'Avg tree depth', unit: 'lvl', icon: 'sitemap', accent: 'var(--violet)', value: 7, trend: -0.3, history: this.wave(7, 24) },
      { id: 'watchers', label: 'Signal watchers', unit: '', icon: 'radar', accent: 'var(--magenta)', value: 1284, trend: 1.4, history: this.wave(1200, 24) },
      { id: 'reclaimed', label: 'GC reclaimed', unit: 'MB', icon: 'recycle', accent: 'var(--emerald)', value: 96, trend: 3.2, history: this.wave(90, 24) },
      { id: 'fps', label: 'Overlay FPS', unit: 'fps', icon: 'gauge', accent: 'var(--amber)', value: 60, trend: 0.0, history: this.wave(60, 24) },
    ];
  }

  private wave(base: number, n: number): number[] {
    return Array.from({ length: n }, (_, i) => Math.round(base * (0.9 + 0.2 * Math.abs(Math.sin(i / 3)))));
  }
}
