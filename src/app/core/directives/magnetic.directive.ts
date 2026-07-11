import { Directive, ElementRef, inject, input, numberAttribute } from '@angular/core';
import { prefersReducedMotion } from './reduced-motion';

/** Maximum drift in px — keeps the pull tactile without the host escaping its slot. */
const MAX_OFFSET = 6;

/**
 * Magnetic hover — the host drifts toward the pointer, clamped to a few px.
 * Uses the individual `translate` property so it composes with any stylesheet
 * `transform`; follows quickly and settles back with a soft spring. No-op under
 * prefers-reduced-motion.
 */
@Directive({
  selector: '[appMagnetic]',
  host: {
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'reset()',
  },
})
export class MagneticDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly strength = input(0.35, { alias: 'appMagnetic', transform: (v: unknown) => numberAttribute(v, 0.35) });

  onMove(event: PointerEvent): void {
    if (prefersReducedMotion()) return;
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const s = this.strength();
    const dx = clamp((event.clientX - (rect.left + rect.width / 2)) * s);
    const dy = clamp((event.clientY - (rect.top + rect.height / 2)) * s);
    // Quick follow while tracking the pointer.
    host.style.transition = magneticTransition('var(--dur-fast) var(--ease-out)');
    host.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
  }

  reset(): void {
    const host = this.el.nativeElement;
    // Springy settle on release.
    host.style.transition = magneticTransition('var(--dur) var(--ease-spring)');
    host.style.translate = '0px 0px';
  }
}

function clamp(value: number): number {
  return Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value));
}

/** Inline transition that keeps the host's usual hover transitions alive
    (an inline `transition` would otherwise clobber its stylesheet list). */
function magneticTransition(translateTiming: string): string {
  return (
    `translate ${translateTiming}, transform var(--dur) var(--ease-out), ` +
    'color var(--dur) var(--ease-out), background-color var(--dur) var(--ease-out), ' +
    'border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out)'
  );
}
