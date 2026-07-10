import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LiveMetric } from '../../../../core/models/metric.model';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { SparklineComponent } from '../../../../shared/ui/sparkline/sparkline.component';
import { CompactNumberPipe } from '../../../../core/pipes/compact-number.pipe';
import { TiltDirective } from '../../../../core/directives/tilt.directive';

type TrendTone = 'up' | 'down' | 'flat';

/**
 * app-metric-tile — a single glass telemetry tile: an accent-tinted icon, its
 * label, a compact-formatted headline value, a coloured trend badge and a
 * live sparkline of the metric's recent history.
 */
@Component({
  selector: 'app-metric-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SparklineComponent, CompactNumberPipe, TiltDirective],
  templateUrl: './metric-tile.component.html',
  styleUrl: './metric-tile.component.scss',
})
export class MetricTileComponent {
  readonly metric = input.required<LiveMetric>();

  /** Direction of the last tick, driving the trend-badge colour + arrow. */
  readonly tone = computed<TrendTone>(() => {
    const t = this.metric().trend;
    return t > 0 ? 'up' : t < 0 ? 'down' : 'flat';
  });

  /** Flat metrics point sideways; up/down reuse the diagonal arrow (flipped in CSS). */
  readonly trendIcon = computed(() =>
    this.tone() === 'flat' ? 'arrow-right' : 'arrow-up-right',
  );

  /** Signed, single-decimal percentage label, e.g. "+2.1%" / "-0.3%". */
  readonly trendLabel = computed(() => {
    const t = this.metric().trend;
    return `${t > 0 ? '+' : ''}${t.toFixed(1)}%`;
  });

  readonly hasUnit = computed(() => this.metric().unit.trim().length > 0);
}
