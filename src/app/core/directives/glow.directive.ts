import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Sets --gx / --gy CSS custom properties (0–100%) to the pointer position so a
 * component can render a radial glow that follows the cursor:
 *   background: radial-gradient(circle at var(--gx) var(--gy), ...);
 */
@Directive({
  selector: '[appGlow]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
  },
})
export class GlowDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  onMove(event: PointerEvent): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const style = this.el.nativeElement.style;
    style.setProperty('--gx', `${x}%`);
    style.setProperty('--gy', `${y}%`);
  }

  reset(): void {
    const style = this.el.nativeElement.style;
    style.setProperty('--gx', '50%');
    style.setProperty('--gy', '50%');
  }
}
