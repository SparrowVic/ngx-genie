import {ChangeDetectionStrategy, Component, effect, ElementRef, HostListener, inject, input, output, viewChild, ViewEncapsulation} from '@angular/core';
import {DOCUMENT} from '@angular/common';

let modalUid = 0;

@Component({
  standalone: true,
  selector: 'gen-modal',
  imports: [],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class GenModalComponent {
  readonly title = input.required<string>();
  readonly isOpen = input.required<boolean>();
  readonly width = input<string>('auto');
  readonly height = input<string>('100%');

  readonly close = output<void>();

  private readonly doc = inject(DOCUMENT);
  private readonly modalContent = viewChild<ElementRef>('modalContent');

  /** Unique id so the dialog is labelled by its title (aria-labelledby). */
  protected readonly titleId = `genie-modal-title-${++modalUid}`;

  /** Element focused before the dialog opened, restored when it closes. */
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    // Move focus into the dialog once it opens and its content has rendered, and restore focus to
    // the previously-focused element on close — so keyboard users don't get stranded behind the backdrop.
    effect(() => {
      const open = this.isOpen();
      const container = this.modalContent()?.nativeElement as HTMLElement | undefined;
      if (open && container) {
        this.previouslyFocused = this.deepActiveElement();
        container.focus();
      } else if (!open) {
        const target = this.previouslyFocused;
        this.previouslyFocused = null;
        target?.focus?.();
      }
    }, {allowSignalWrites: true});
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) {
      this.close.emit();
    }
  }

  /** Focus trap: if focus escapes the open dialog, pull it back to the container. Slot-aware via composedPath. */
  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent) {
    if (!this.isOpen()) return;
    const container = this.modalContent()?.nativeElement as HTMLElement | undefined;
    if (!container) return;
    if (!event.composedPath().includes(container)) {
      container.focus();
    }
  }

  onBackdropClick(event: MouseEvent) {
    const contentEl = this.modalContent()?.nativeElement;
    if (contentEl && !contentEl.contains(event.target as Node)) {
      this.close.emit();
    }
  }

  /** Deepest active element, piercing shadow roots (document.activeElement only sees the top host). */
  private deepActiveElement(): HTMLElement | null {
    let active = this.doc.activeElement as HTMLElement | null;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement as HTMLElement;
    }
    return active;
  }
}
