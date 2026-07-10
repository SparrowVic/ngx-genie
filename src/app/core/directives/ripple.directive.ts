import { Directive, ElementRef, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Material-ish click ripple. Adds an absolutely-positioned span on pointerdown. */
@Directive({
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
  readonly color = input('rgba(255,255,255,0.35)', { alias: 'appRipple' });

  spawn(event: PointerEvent): void {
    if (!this.isBrowser) return;
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.style.cssText = [
      'position:absolute',
      `left:${event.clientX - rect.left - size / 2}px`,
      `top:${event.clientY - rect.top - size / 2}px`,
      `width:${size}px`,
      `height:${size}px`,
      'border-radius:50%',
      `background:${this.color()}`,
      'pointer-events:none',
      'transform:scale(0)',
      'opacity:0.55',
      'transition:transform 560ms var(--ease-out),opacity 560ms var(--ease-out)',
    ].join(';');
    host.appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform = 'scale(2.6)';
      ripple.style.opacity = '0';
    });
    setTimeout(() => ripple.remove(), 600);
  }
}
