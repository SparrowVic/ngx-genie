import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ContentService } from '../../core/services/content.service';
import { ScrollSpyService } from '../../core/services/scroll-spy.service';
import { HotkeyService } from '../../core/services/hotkey.service';
import { SectionHeaderComponent } from '../../shared/ui/section-header/section-header.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';
import { DocsSectionComponent } from './docs-section/docs-section.component';
import { DocsInstallComponent } from './docs-install/docs-install.component';
import { ConfigTableComponent } from './config-table/config-table.component';

interface TocItem {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
}

/**
 * app-docs-page — the GenieOS documentation layout: a sticky, scroll-synced
 * table of contents beside a stream of anchored doc sections, the configuration
 * reference, Angular compatibility notes and a dev-only safety callout.
 */
@Component({
  selector: 'app-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './docs-page.component.html',
  styleUrl: './docs-page.component.scss',
  imports: [
    SectionHeaderComponent,
    IconComponent,
    ChipComponent,
    ButtonComponent,
    RevealOnScrollDirective,
    DocsSectionComponent,
    DocsInstallComponent,
    ConfigTableComponent,
  ],
})
export class DocsPageComponent {
  protected readonly content = inject(ContentService);
  protected readonly hotkey = inject(HotkeyService);
  private readonly scrollSpy = inject(ScrollSpyService);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** Page header subtitle — mentions the configured overlay hotkey. */
  readonly heroSubtitle = `Install GenieOS as a dev dependency, wire up one standalone provider, and press ${this.hotkey.key}. From zero to a live dependency-injection graph in under a minute.`;

  /** Table of contents = every doc section, then the config + compatibility anchors. */
  readonly tocItems = computed<TocItem[]>(() => [
    ...this.content.docs().map((d) => ({ id: d.id, title: d.title, icon: d.icon })),
    { id: 'config', title: 'Configuration', icon: 'settings' },
    { id: 'compatibility', title: 'Compatibility', icon: 'shield' },
  ]);

  /** The currently highlighted section — set on click and while scrolling. */
  readonly activeId = signal(this.content.docs()[0]?.id ?? 'install');

  constructor() {
    // Once the sections exist in the DOM, keep the TOC synced to the viewport.
    afterNextRender(() => this.observeSections());
  }

  /** Jump to a section and mark it active. */
  select(id: string): void {
    this.setActive(id);
    // scrollIntoView ignores the CSS reduced-motion kill-switch, so gate it here.
    const reduceMotion =
      this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    this.doc
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  private setActive(id: string): void {
    this.activeId.set(id);
    this.scrollSpy.setActive(id);
  }

  /** Highlight whichever section is nearest the top of the reading area. */
  private observeSections(): void {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top?.target.id) this.setActive(top.target.id);
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );

    for (const item of this.tocItems()) {
      const el = this.doc.getElementById(item.id);
      if (el) observer.observe(el);
    }

    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
