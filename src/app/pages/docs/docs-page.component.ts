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
import { InstallService } from '../../core/services/install.service';
import { PackageManager } from '../../core/models/install.model';
import { SectionHeaderComponent } from '../../shared/ui/section-header/section-header.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { CodeBlockComponent } from '../../shared/ui/code-block/code-block.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';
import { DocsSectionComponent } from './docs-section/docs-section.component';
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
    CodeBlockComponent,
    ButtonComponent,
    RevealOnScrollDirective,
    DocsSectionComponent,
    ConfigTableComponent,
  ],
})
export class DocsPageComponent {
  protected readonly content = inject(ContentService);
  protected readonly install = inject(InstallService);
  private readonly scrollSpy = inject(ScrollSpyService);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

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
    this.doc.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Switch the package manager shown in the quick-install snippet. */
  selectManager(manager: PackageManager): void {
    this.install.select(manager);
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
