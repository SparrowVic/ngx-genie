import { DestroyRef, Directive, ElementRef, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { prefersReducedMotion } from './reduced-motion';

/**
 * Material-ish click ripple. Adds an absolutely-positioned span on pointerdown,
 * sized to reach the farthest corner from the press point. Skipped entirely
 * under prefers-reduced-motion; pending removals are flushed on destroy.
 */
@Directive({
  standalone: true,
  selector: '[appRipple]',
  host: {
    '(pointerdown)': 'spawn($event)',
    '[style.position]': '"relative"',
    '[style.overflow]': '"hidden"',
  },
})
export class RippleDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  readonly color = input('rgba(255,255,255,0.35)', { alias: 'appRipple' });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
      this.timers.clear();
    });
  }

  spawn(event: PointerEvent): void {
    if (!this.isBrowser || prefersReducedMotion()) return;
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // Radius to the farthest corner so the wave always floods the host.
    const radius = Math.hypot(Math.max(px, rect.width - px), Math.max(py, rect.height - py));
    const size = radius * 2;
    const ripple = document.createElement('span');
    ripple.style.cssText = [
      'position:absolute',
      `left:${px - radius}px`,
      `top:${py - radius}px`,
      `width:${size}px`,
      `height:${size}px`,
      'border-radius:50%',
      `background:${this.color()}`,
      'pointer-events:none',
      'transform:scale(0)',
      'opacity:0.55',
      'transition:transform 480ms var(--ease-out-expo),opacity 480ms var(--ease-out)',
    ].join(';');
    host.appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform = 'scale(1)';
      ripple.style.opacity = '0';
    });
    const timer = setTimeout(() => {
      ripple.remove();
      this.timers.delete(timer);
    }, 520);
    this.timers.add(timer);
  }
}
