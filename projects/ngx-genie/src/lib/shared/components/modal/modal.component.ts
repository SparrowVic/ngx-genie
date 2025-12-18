import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
  ViewEncapsulation
} from '@angular/core';

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


  private readonly modalContent = viewChild<ElementRef>('modalContent');

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event) {
    if (this.isOpen()) {
      this.close.emit();
    }
  }

  onBackdropClick(event: MouseEvent) {

    const contentEl = this.modalContent()?.nativeElement;
    if (contentEl && !contentEl.contains(event.target as Node)) {
      this.close.emit();
    }
  }
}
