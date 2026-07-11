import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FeatureCatalogService } from '../../core/services/feature-catalog.service';
import { FeatureId } from '../../core/models/feature.model';
import { APP_BRAND } from '../../core/tokens/brand.token';
import { SectionHeaderComponent } from '../../shared/ui/section-header/section-header.component';
import { StatComponent } from '../../shared/ui/stat/stat.component';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FeatureDetailComponent } from './feature-detail/feature-detail.component';
import { RoadmapComponent } from './roadmap/roadmap.component';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';
import { MagneticDirective } from '../../core/directives/magnetic.directive';

/**
 * app-features-page — the full tour of the six GenieOS inspector views. A sticky
 * mini-nav (whose active item tracks the catalog's selection signal, kept in sync
 * with scroll position) sits beside an alternating stack of feature spotlights,
 * capped by the delivery roadmap.
 */
@Component({
  selector: 'app-features-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './features-page.component.html',
  styleUrl: './features-page.component.scss',
  imports: [
    SectionHeaderComponent,
    StatComponent,
    ChipComponent,
    ButtonComponent,
    IconComponent,
    FeatureDetailComponent,
    RoadmapComponent,
    RevealOnScrollDirective,
    MagneticDirective,
  ],
})
export class FeaturesPageComponent implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly catalog = inject(FeatureCatalogService);
  readonly brand = inject(APP_BRAND);

  readonly features = this.catalog.features;
  readonly activeId = this.catalog.selectedId;
  readonly viewCount = this.catalog.count;

  /** Provider/dependency kinds GenieOS classifies (Service, Pipe, Directive, Component, …). */
  readonly providerTypes = 9;

  /** Automated diagnostic checks GenieOS runs (singleton-violation, heavy-state, …). */
  readonly diagnosticChecks = 8;

  /** Total distinct capabilities listed across every view. */
  readonly capabilityCount = computed(() =>
    this.features().reduce((sum, f) => sum + f.bullets.length, 0),
  );

  private observer?: IntersectionObserver;

  constructor() {
    // Scroll-spy: keep the sticky nav's active item in sync with the viewport.
    afterNextRender(() => this.observeSections());
  }

  private observeSections(): void {
    const sections =
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-feature-section]');
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute('data-feature-section') as FeatureId | null;
          if (id) this.catalog.select(id);
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    sections.forEach((section) => this.observer?.observe(section));
  }

  /** Select a view and smooth-scroll its spotlight into focus. */
  focus(id: FeatureId): void {
    this.catalog.select(id);
    if (!this.isBrowser) return;
    const target = this.host.nativeElement.querySelector<HTMLElement>(
      `[data-feature-section="${id}"]`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
