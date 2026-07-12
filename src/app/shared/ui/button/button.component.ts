import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { RippleDirective } from '../../../core/directives/ripple.directive';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'solid';
type ButtonSize = 'sm' | 'md' | 'lg';
type RenderMode = 'route' | 'external' | 'button';

/**
 * ui-button — the single call-to-action primitive. Renders as an internal
 * routerLink anchor, an external anchor, or a native button depending on href,
 * with four polished variants and a click ripple.
 */
@Component({
  standalone: true,
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  imports: [RouterLink, IconComponent, RippleDirective, NgTemplateOutlet],
  host: {
    '[class.is-block]': 'block()',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly href = input<string>();
  readonly icon = input<string>();
  readonly iconRight = input<string>();
  readonly block = input(false);
  readonly disabled = input(false);

  readonly press = output<void>();

  /** Which element to render: internal link, external link, or a button. */
  readonly mode = computed<RenderMode>(() => {
    const target = this.href();
    if (!target) return 'button';
    return target.startsWith('/') ? 'route' : 'external';
  });

  readonly classes = computed(() => {
    const base = `btn btn--${this.variant()} btn--${this.size()}`;
    return `${base}${this.block() ? ' btn--block' : ''}${this.disabled() ? ' is-disabled' : ''}`;
  });

  /** Icon glyphs scale a touch with the button size. */
  readonly iconSize = computed(() => {
    switch (this.size()) {
      case 'sm': return 15;
      case 'lg': return 20;
      default: return 18;
    }
  });

  /** Ripple reads light on filled variants, violet-tinted on quieter ones. */
  readonly rippleColor = computed(() => {
    const v = this.variant();
    return v === 'primary' || v === 'solid'
      ? 'rgba(255, 255, 255, 0.45)'
      : 'rgba(139, 92, 246, 0.3)';
  });
}
