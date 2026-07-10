import { Directive, ElementRef, inject, input, numberAttribute } from '@angular/core';

/** 3D pointer tilt. Usage: <div [appTilt]="12"> (degrees, optional). */
@Directive({
  selector: '[appTilt]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
    '[style.transition]': '"transform 160ms var(--ease-out)"',
    '[style.transform-style]': '"preserve-3d"',
  },
})
export class TiltDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly max = input(10, { alias: 'appTilt', transform: (v: unknown) => numberAttribute(v, 10) });

  onMove(event: PointerEvent): void {
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const m = this.max();
    host.style.transform = `perspective(900px) rotateY(${px * m}deg) rotateX(${-py * m}deg) translateZ(0)`;
  }

  reset(): void {
    this.el.nativeElement.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
  }
}
