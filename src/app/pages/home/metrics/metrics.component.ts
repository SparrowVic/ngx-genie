import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { MetricTileComponent } from './metric-tile/metric-tile.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { CompactNumberPipe } from '../../../core/pipes/compact-number.pipe';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/**
 * app-metrics — the "live observatory" band. Renders a grid of glass metric
 * tiles from the TelemetryService feed, headed by a live/snapshot indicator
 * and a small derived-summary strip (peak throughput, rising count, avg trend).
 */
@Component({
  selector: 'app-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionHeaderComponent,
    IconComponent,
    MetricTileComponent,
    RevealOnScrollDirective,
    CompactNumberPipe,
    PluralizePipe,
    DecimalPipe,
  ],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.scss',
})
export class MetricsComponent {
  protected readonly telemetry = inject(TelemetryService);

  readonly metrics = this.telemetry.metrics;
  readonly isLive = this.telemetry.isLive;
  readonly rising = this.telemetry.rising;

  /** Highest DI-resolutions/s throughput observed since mount. */
  private readonly _peak = signal(this.telemetry.resolutions());
  readonly peak = this._peak.asReadonly();

  readonly averageTrend = computed(() => +this.telemetry.averageTrend().toFixed(1));
  readonly liveLabel = computed(() => (this.isLive() ? 'Streaming live' : 'Snapshot'));

  constructor() {
    // Track the running peak as the simulated feed ticks.
    effect(() => {
      const current = this.telemetry.resolutions();
      this._peak.update((peak) => Math.max(peak, current));
    });
  }
}
