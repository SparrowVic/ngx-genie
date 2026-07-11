import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TelemetryService } from '../../../core/services/telemetry.service';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { MetricTileComponent } from './metric-tile/metric-tile.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';

/**
 * app-metrics — the "by the numbers" band. Renders a grid of glass tiles from
 * the TelemetryService, one per verifiable fact about the GenieOS overlay.
 */
@Component({
  selector: 'app-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionHeaderComponent, MetricTileComponent, RevealOnScrollDirective],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.scss',
})
export class MetricsComponent {
  private readonly telemetry = inject(TelemetryService);

  readonly metrics = this.telemetry.metrics;
}
