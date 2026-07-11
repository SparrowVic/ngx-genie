import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Metric } from '../../../../core/models/metric.model';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { CountUpDirective } from '../../../../core/directives/count-up.directive';

/**
 * app-metric-tile — one cell of the "by the numbers" band: an accent-tinted
 * icon, its label and a big mono headline value that counts up on first view.
 * Static data, no trend badge.
 */
@Component({
  selector: 'app-metric-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, CountUpDirective],
  templateUrl: './metric-tile.component.html',
  styleUrl: './metric-tile.component.scss',
})
export class MetricTileComponent {
  readonly metric = input.required<Metric>();
}
