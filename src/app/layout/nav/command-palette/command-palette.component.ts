import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { HighlightPipe } from '../../../core/pipes/highlight.pipe';
import { CommandPaletteService } from '../../../core/services/command-palette.service';
import { ThemeService } from '../../../core/services/theme.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CommandAction } from '../../../core/models/content.model';

/**
 * app-command-palette — the ⌘K overlay. Reads CommandPaletteService for open
 * state, the query signal and grouped results, then routes / opens / toggles
 * theme / hints the overlay depending on the chosen action. Fully keyboard
 * driven: type to filter, arrows to move, Enter to run, Esc / backdrop to close.
 */
@Component({
  selector: 'app-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
  imports: [IconComponent, HighlightPipe],
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly notify = inject(NotificationService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly palette = inject(CommandPaletteService);

  protected readonly open = this.palette.open;
  protected readonly query = this.palette.query;
  protected readonly grouped = this.palette.grouped;
  protected readonly results = this.palette.results;
  protected readonly hasResults = this.palette.hasResults;

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly activeIndex = signal(0);

  /** Id of the currently highlighted result, used to paint the active row. */
  protected readonly activeId = computed(() => this.results()[this.activeIndex()]?.id ?? null);

  constructor() {
    effect(() => {
      const isOpen = this.open();
      if (!this.isBrowser) return;
      // Lock the page behind the overlay and focus the field on open.
      document.body.style.overflow = isOpen ? 'hidden' : '';
      if (isOpen) {
        this.activeIndex.set(0);
        queueMicrotask(() => this.searchInput()?.nativeElement.focus());
      }
    });
  }

  protected onInput(event: Event): void {
    this.palette.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const action = this.results()[this.activeIndex()];
        if (action) this.run(action);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.palette.close();
        break;
    }
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (this.open() && event.key === 'Escape') this.palette.close();
  }

  protected setActiveById(id: string): void {
    const index = this.results().findIndex((a) => a.id === id);
    if (index >= 0) this.activeIndex.set(index);
  }

  protected run(action: CommandAction): void {
    if (action.path) {
      this.router.navigateByUrl(action.path);
    } else if (action.external) {
      if (this.isBrowser) window.open(action.external, '_blank', 'noopener,noreferrer');
    } else if (action.id === 'theme') {
      this.theme.toggle();
    } else {
      this.notify.push({
        title: 'Summon the overlay',
        message: 'Press F1 anywhere to open the GenieOS dependency graph.',
        tone: 'info',
        icon: 'bolt',
      });
    }
    this.palette.close();
  }

  private move(delta: number): void {
    const count = this.results().length;
    if (!count) return;
    this.activeIndex.update((i) => (i + delta + count) % count);
  }
}
