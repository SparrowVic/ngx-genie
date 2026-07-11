import { Directive, ElementRef, inject, input, numberAttribute } from '@angular/core';
import { prefersReducedMotion } from './reduced-motion';

/**
 * 3D pointer tilt. Usage: <div [appTilt]="12"> (degrees, optional).
 * Tracks the pointer quickly, settles back on leave. A max of 0 disables it;
 * prefers-reduced-motion no-ops entirely.
 */
@Directive({
  selector: '[appTilt]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
    '[style.transform-style]': '"preserve-3d"',
  },
})
export class TiltDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly max = input(10, { alias: 'appTilt', transform: (v: unknown) => numberAttribute(v, 10) });

  onMove(event: PointerEvent): void {
    const m = this.max();
    if (m === 0 || prefersReducedMotion()) {
      // A max that just dropped to 0 (e.g. card became selected) must not
      // strand the last pointer-tracked transform on the element.
      this.clearInline();
      return;
    }
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    // Short follow keeps the surface glued to the pointer without wobble.
    host.style.transition = tiltTransition('var(--dur-fast)');
    host.style.transform = `perspective(900px) rotateY(${(px * m).toFixed(2)}deg) rotateX(${(-py * m).toFixed(2)}deg) translateZ(0)`;
  }

  reset(): void {
    if (this.max() === 0 || prefersReducedMotion()) {
      this.clearInline();
      return;
    }
    const host = this.el.nativeElement;
    host.style.transition = tiltTransition('var(--dur)');
    host.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
  }

  private clearInline(): void {
    const style = this.el.nativeElement.style;
    style.removeProperty('transform');
    style.removeProperty('transition');
  }
}

/** Inline transition that keeps hosts' box-shadow/border hover transitions alive
    (an inline `transition` would otherwise clobber their stylesheet list). */
function tiltTransition(transformDur: string): string {
  return `transform ${transformDur} var(--ease-out), box-shadow var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out)`;
}
