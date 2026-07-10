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
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly suffix = input('');
  readonly accent = input('var(--violet)');
  readonly icon = input<string>();
  readonly decimals = input(0);

  /** Accessible, non-animated description read by assistive tech. */
  readonly ariaLabel = computed(() => {
    const formatted = this.value().toLocaleString('en-US', {
      minimumFractionDigits: this.decimals(),
      maximumFractionDigits: this.decimals(),
    });
    return `${formatted}${this.suffix()} — ${this.label()}`;
  });
}
