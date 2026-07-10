import { Directive, ElementRef, inject, input, numberAttribute } from '@angular/core';

/** Magnetic hover — the host drifts toward the pointer. Great for CTAs. */
@Directive({
  selector: '[appMagnetic]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
    '[style.transition]': '"transform 220ms var(--ease-out)"',
  },
})
export class MagneticDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly strength = input(0.35, { alias: 'appMagnetic', transform: (v: unknown) => numberAttribute(v, 0.35) });

  onMove(event: PointerEvent): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const s = this.strength();
    this.el.nativeElement.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
  }

  reset(): void {
    this.el.nativeElement.style.transform = 'translate(0, 0)';
  }
}
