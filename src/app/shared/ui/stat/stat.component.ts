import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { CountUpDirective } from '../../../core/directives/count-up.directive';

/**
 * ui-stat — a headline metric: a big count-up number (in --font-display, tinted by
 * `accent`), an optional leading icon, and a label beneath. The number animates from
 * 0 to `value` the first time it scrolls into view via the appCountUp directive.
 */
@Component({
  selector: 'ui-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, CountUpDirective],
  templateUrl: './stat.component.html',
  styleUrl: './stat.component.scss',
})
export class StatComponent {
  readonly value = input.required<string | number>();
  readonly label = input.required<string>();
  readonly suffix = input('');
  readonly accent = input('var(--violet)');
  readonly icon = input<string>();
  readonly decimals = input(0);

  /** Numeric values count up; qualitative strings render verbatim. */
  readonly isNumeric = computed(() => typeof this.value() === 'number');

  /** Narrowed numeric value for the count-up directive (0 when the value is a string). */
  readonly numericValue = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? v : 0;
  });

  /** Accessible, non-animated description read by assistive tech. */
  readonly ariaLabel = computed(() => {
    const v = this.value();
    const formatted =
      typeof v === 'number'
        ? v.toLocaleString('en-US', {
            minimumFractionDigits: this.decimals(),
            maximumFractionDigits: this.decimals(),
          })
        : v;
    return `${formatted}${this.suffix()} — ${this.label()}`;
  });
}
