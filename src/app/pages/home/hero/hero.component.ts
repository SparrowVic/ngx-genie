import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StatsService } from '../../../core/services/stats.service';
import { FeatureCatalogService } from '../../../core/services/feature-catalog.service';
import { HotkeyService } from '../../../core/services/hotkey.service';
import { APP_BRAND } from '../../../core/tokens/brand.token';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { StatComponent } from '../../../shared/ui/stat/stat.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { MagneticDirective } from '../../../core/directives/magnetic.directive';
import { HeroOrbitComponent } from './hero-orbit/hero-orbit.component';
import { HeroTerminalComponent } from './hero-terminal/hero-terminal.component';

/**
 * app-hero — the landing showstopper. A full-height cosmic hero pairing the value
 * proposition, primary CTAs and headline stats on the left with the animated
 * dependency orbit and a live-typing setup terminal on the right.
 */
@Component({
  standalone: true,
  selector: 'app-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
  imports: [
    ButtonComponent,
    StatComponent,
    ChipComponent,
    IconComponent,
    RevealOnScrollDirective,
    MagneticDirective,
    HeroOrbitComponent,
    HeroTerminalComponent,
  ],
})
export class HeroComponent {
  private readonly stats = inject(StatsService);
  private readonly catalog = inject(FeatureCatalogService);
  readonly brand = inject(APP_BRAND);
  protected readonly hotkey = inject(HotkeyService);

  /** Headline metrics rendered as a row of ui-stat blocks. */
  readonly headline = this.stats.headline;

  /** A compact strip of the marquee inspector views. */
  readonly spotlightFeatures = computed(() => this.catalog.features().slice(0, 4));

  readonly featureCount = this.catalog.count;

  /** "Angular 18 ready" — the major pulled from the brand version string. */
  readonly angularMajor = computed(() => this.brand.version.split('.')[0]);

  /**
   * The keycap affordance: replays the real, configured hotkey so the actual
   * GenieOS overlay (listening on window) opens — no simulation involved.
   */
  summonOverlay(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: this.hotkey.key }));
  }
}
