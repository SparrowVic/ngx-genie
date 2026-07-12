import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GenieFeature } from '../../../core/models/feature.model';
import { HotkeyService } from '../../../core/services/hotkey.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { StatComponent } from '../../../shared/ui/stat/stat.component';
import { CodeBlockComponent } from '../../../shared/ui/code-block/code-block.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { GlowDirective } from '../../../core/directives/glow.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';
import { OrdinalPipe } from '../../../core/pipes/ordinal.pipe';

/**
 * app-feature-detail — one inspector view rendered as a rich, alternating
 * (left/right) spotlight: a framed product shot (a real capture of GenieOS
 * inspecting this site — falling back to a glowing accent tile when a feature
 * ships without media) paired with the feature's name, tagline, description,
 * check-listed capabilities, a live stat row and a copyable demo snippet.
 * Alternation is driven by the zero-based `index`.
 */
@Component({
  selector: 'app-feature-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feature-detail.component.html',
  styleUrl: './feature-detail.component.scss',
  imports: [
    IconComponent,
    ChipComponent,
    StatComponent,
    CodeBlockComponent,
    RevealOnScrollDirective,
    GlowDirective,
    PluralizePipe,
    OrdinalPipe,
  ],
})
export class FeatureDetailComponent {
  protected readonly hotkey = inject(HotkeyService);

  readonly feature = input.required<GenieFeature>();
  /** Zero-based position in the list — drives the alternating layout. */
  readonly index = input(0);

  /** Odd rows flip so the visual tile and body swap sides. */
  readonly flip = computed(() => this.index() % 2 === 1);

  /** Human 1-based counter shown on the tile, e.g. "01". */
  readonly counter = computed(() => String(this.index() + 1).padStart(2, '0'));

  /** A plausible source filename for the code frame, derived from the id. */
  readonly filename = computed(() => `${this.feature().id}.view.ts`);

  /** Total capabilities listed — reused in the badge row. */
  readonly bulletCount = computed(() => this.feature().bullets.length);

  /** Portrait panel crops get a narrower, centred frame. */
  readonly portrait = computed(() => {
    const media = this.feature().media;
    return !!media && media.height > media.width;
  });
}
