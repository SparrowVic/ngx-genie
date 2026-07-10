import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { APP_BRAND } from '../../../core/tokens/brand.token';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { GlowDirective } from '../../../core/directives/glow.directive';
import { MagneticDirective } from '../../../core/directives/magnetic.directive';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';

/**
 * app-final-cta — the closing aurora panel. A cursor-following glow lights the
 * backdrop while the two magnetic call-to-action buttons drift toward the
 * pointer. Brand routes (docs, GitHub) come straight from the injected token.
 */
@Component({
  selector: 'app-final-cta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ChipComponent,
    GlowDirective,
    MagneticDirective,
    RevealOnScrollDirective,
  ],
  templateUrl: './final-cta.component.html',
  styleUrl: './final-cta.component.scss',
})
export class FinalCtaComponent {
  protected readonly brand = inject(APP_BRAND);
}
