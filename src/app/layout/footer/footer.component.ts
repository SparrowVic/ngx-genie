import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_BRAND } from '../../core/tokens/brand.token';
import { ClockService } from '../../core/services/clock.service';
import { LogoComponent } from '../../shared/ui/logo/logo.component';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';
import { FooterNewsletterComponent } from './footer-newsletter/footer-newsletter.component';

/** A single footer link — internal (routerLink) or external (new tab). */
interface FooterLink {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
  readonly icon?: string;
}

/** A titled column of footer links. */
interface FooterColumn {
  readonly title: string;
  readonly links: readonly FooterLink[];
}

/** A brand credential chip rendered under the wordmark. */
interface BrandChip {
  readonly label: string;
  readonly icon: string;
  readonly accent: string;
}

/** A compact social/destination icon shown in the bottom bar. */
interface SocialLink {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

/**
 * app-footer — the site's landing pad: brand column with credentials, three link
 * columns, the newsletter opt-in, and a bottom bar with the live version, an
 * auto-updating copyright year and social destinations.
 */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  imports: [
    RouterLink,
    LogoComponent,
    ChipComponent,
    IconComponent,
    RevealOnScrollDirective,
    FooterNewsletterComponent,
  ],
})
export class FooterComponent {
  protected readonly brand = inject(APP_BRAND);
  private readonly clock = inject(ClockService);

  /** Copyright year tracks the live clock so it never goes stale. */
  readonly year = computed(() => new Date(this.clock.now()).getFullYear());

  readonly brandChips: readonly BrandChip[] = [
    { label: 'Angular 22', icon: 'atom', accent: 'var(--rose)' },
    { label: 'Zero-config', icon: 'bolt', accent: 'var(--cyan)' },
    { label: 'MIT + Commons Clause', icon: 'shield', accent: 'var(--emerald)' },
  ];

  readonly columns: readonly FooterColumn[] = [
    {
      title: 'Product',
      links: [
        { label: 'Overview', href: '/' },
        { label: 'Features', href: '/features' },
        { label: 'Playground', href: '/playground' },
        { label: 'Documentation', href: '/docs' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Getting started', href: '/docs' },
        { label: 'Roadmap', href: '/features#roadmap' },
        { label: 'Releases', href: `${this.brand.github}/releases`, external: true, icon: 'github' },
        { label: 'npm package', href: this.brand.npm, external: true, icon: 'npm' },
      ],
    },
    {
      title: 'Project',
      links: [
        { label: 'GitHub', href: this.brand.github, external: true, icon: 'github' },
        { label: 'Report an issue', href: `${this.brand.github}/issues`, external: true, icon: 'flask' },
        { label: 'Discussions', href: `${this.brand.github}/discussions`, external: true, icon: 'command' },
        { label: 'Star the repo', href: this.brand.github, external: true, icon: 'star' },
      ],
    },
  ];

  readonly socials: readonly SocialLink[] = [
    { label: 'GitHub', href: this.brand.github, icon: 'github' },
    { label: 'npm', href: this.brand.npm, icon: 'npm' },
    { label: 'Star the repo', href: this.brand.github, icon: 'star' },
    { label: 'Sponsor', href: `${this.brand.github}/sponsors`, icon: 'heart' },
  ];
}
