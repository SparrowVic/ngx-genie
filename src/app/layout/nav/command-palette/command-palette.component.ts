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
 * driven: type to filter, arrows to move, Enter to run, Esc / backdrop to
 * close. Focus is trapped inside the dialog while open and handed back to the
 * invoking control on close.
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

  /** The control that summoned the palette, so focus can return to it on close. */
  private lastFocused: HTMLElement | null = null;

  /** Last pointer position, so hover-activation only reacts to real motion —
      not to rows sliding under a resting cursor during arrow-key scrolling. */
  private lastPointerX = NaN;
  private lastPointerY = NaN;

  /** Id of the currently highlighted result, used to paint the active row. */
  protected readonly activeId = computed(() => this.results()[this.activeIndex()]?.id ?? null);

  /** DOM id of the active option, wired to aria-activedescendant on the input. */
  protected readonly activeOptionId = computed(() => {
    const id = this.activeId();
    return id ? `palette-opt-${id}` : null;
  });

  constructor() {
    effect(() => {
      const isOpen = this.open();
      if (!this.isBrowser) return;
      // Lock the page behind the overlay and focus the field on open.
      document.body.style.overflow = isOpen ? 'hidden' : '';
      if (isOpen) {
        this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.activeIndex.set(0);
        queueMicrotask(() => this.searchInput()?.nativeElement.focus());
      } else {
        this.lastFocused?.focus();
        this.lastFocused = null;
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
    if (!this.open()) return;
    if (event.key === 'Escape') {
      this.palette.close();
    } else if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  protected setActiveById(id: string): void {
    const index = this.results().findIndex((a) => a.id === id);
    if (index >= 0) this.activeIndex.set(index);
  }

  protected onOptionPointerMove(event: PointerEvent, id: string): void {
    if (event.clientX === this.lastPointerX && event.clientY === this.lastPointerY) return;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.setActiveById(id);
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
    // The option nodes are stable during arrow navigation, so the target
    // already exists — only the .is-active paint lands on the next render.
    const id = this.activeOptionId();
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
  }

  /** Per the activedescendant combobox pattern the input is the dialog's only
      tab stop, so Tab simply keeps DOM focus parked on it. */
  private trapFocus(event: KeyboardEvent): void {
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }
}
