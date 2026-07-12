import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GenieFeature } from '../../../../core/models/feature.model';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { TiltDirective } from '../../../../core/directives/tilt.directive';
import { RippleDirective } from '../../../../core/directives/ripple.directive';

/**
 * app-feature-card — a compact, selectable row for one GenieOS inspector view.
 * Drives the showcase selection: emits `select` on click and paints its active
 * state from the feature's own accent colour.
 */
@Component({
  standalone: true,
  selector: 'app-feature-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TiltDirective, RippleDirective],
  templateUrl: './feature-card.component.html',
  styleUrl: './feature-card.component.scss',
})
export class FeatureCardComponent {
  readonly feature = input.required<GenieFeature>();
  readonly selected = input(false);
  readonly select = output<void>();

  /** Accent-tinted click ripple derived from the feature's colour. */
  readonly rippleColor = computed(
    () => `color-mix(in oklab, ${this.feature().accent} 30%, transparent)`,
  );

  activate(): void {
    this.select.emit();
  }
}
