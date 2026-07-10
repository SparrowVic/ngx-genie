import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { ScrollSpyService } from '../../core/services/scroll-spy.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { HeroComponent } from './hero/hero.component';
import { MetricsComponent } from './metrics/metrics.component';
import { FeatureShowcaseComponent } from './feature-showcase/feature-showcase.component';
import { MechanismComponent } from './mechanism/mechanism.component';
import { ConstellationDemoComponent } from './constellation-demo/constellation-demo.component';
import { TestimonialsComponent } from './testimonials/testimonials.component';
import { InstallComponent } from './install/install.component';
import { FaqComponent } from './faq/faq.component';
import { FinalCtaComponent } from './final-cta/final-cta.component';

interface SectionLink {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

/**
 * app-home-page — composes the full GenieOS landing page in order and drives a
 * right-side dot navigator. An IntersectionObserver reports the section in view
 * into the shared ScrollSpyService so the active dot (and nav) stay in sync.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  imports: [
    IconComponent,
    HeroComponent,
    MetricsComponent,
    FeatureShowcaseComponent,
    MechanismComponent,
    ConstellationDemoComponent,
    TestimonialsComponent,
    InstallComponent,
    FaqComponent,
    FinalCtaComponent,
  ],
})
export class HomePageComponent {
  private readonly scrollSpy = inject(ScrollSpyService);
  private readonly destroyRef = inject(DestroyRef);

  /** The active section id, reflected out of the shared scroll store. */
  readonly activeId = this.scrollSpy.active;

  /** Ordered anchors that back both the page sections and the dot navigator. */
  readonly sections = signal<SectionLink[]>([
    { id: 'hero', label: 'Overview', icon: 'home' },
    { id: 'metrics', label: 'Live metrics', icon: 'gauge' },
    { id: 'features', label: 'Features', icon: 'sparkles' },
    { id: 'mechanism', label: 'How it works', icon: 'cpu' },
    { id: 'constellation', label: 'Constellation', icon: 'atom' },
    { id: 'testimonials', label: 'Voices', icon: 'heart' },
    { id: 'install', label: 'Install', icon: 'download' },
    { id: 'faq', label: 'FAQ', icon: 'book' },
    { id: 'cta', label: 'Get started', icon: 'bolt' },
  ]);

  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this.scrollSpy.setActive(entry.target.id);
          }
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
      );
      for (const section of this.sections()) {
        const el = document.getElementById(section.id);
        if (el) this.observer.observe(el);
      }
    });

    this.destroyRef.onDestroy(() => this.observer?.disconnect());
  }

  select(id: string): void {
    this.scrollSpy.setActive(id);
  }
}
