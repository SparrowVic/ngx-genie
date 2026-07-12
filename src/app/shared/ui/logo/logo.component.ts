import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { APP_BRAND } from '../../../core/tokens/brand.token';

/** Per-instance counter so each logo owns unique SVG gradient ids (no <defs> collisions). */
let logoInstanceId = 0;

/**
 * ui-logo — the animated GenieOS mark: a magic lamp filled with the brand
 * spectrum, wrapped in a soft pulsing aura, with wish-sparks twinkling above
 * the spout. Optionally renders the wordmark (pulled from the brand token).
 */
@Component({
  standalone: true,
  selector: 'ui-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logo.component.html',
  styleUrl: './logo.component.scss',
})
export class LogoComponent {
  private readonly brand = inject(APP_BRAND);

  readonly size = input(28);
  readonly showText = input(false);

  /** Wordmark rendered next to the mark when showText is true. */
  readonly wordmark = this.brand.name;

  private readonly uid = ++logoInstanceId;
  readonly gradId = `genie-lamp-grad-${this.uid}`;
  readonly glowId = `genie-lamp-glow-${this.uid}`;

  /** Convenience refs so the template can build the url(#id) paint values. */
  readonly lampPaint = computed(() => `url(#${this.gradId})`);
  readonly haloPaint = computed(() => `url(#${this.glowId})`);
}
