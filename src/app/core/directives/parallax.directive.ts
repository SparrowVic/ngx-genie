import { Directive, ElementRef, OnInit, PLATFORM_ID, inject, input, numberAttribute } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { prefersReducedMotion } from './reduced-motion';

/** Translates the host on scroll for a depth effect. Factor < 1 = slower.
    Scroll-linked motion, so it no-ops under prefers-reduced-motion. */
@Directive({
  standalone: true,
  selector: '[appParallax]',
  host: { '(window:scroll)': 'onScroll()' },
})
export class ParallaxDirective implements OnInit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly factor = input(0.2, { alias: 'appParallax', transform: (v: unknown) => numberAttribute(v, 0.2) });
  private ticking = false;

  ngOnInit(): void {
    if (this.isBrowser) this.apply();
  }

  onScroll(): void {
    if (!this.isBrowser || this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.apply();
      this.ticking = false;
    });
  }

  private apply(): void {
    const host = this.el.nativeElement;
    if (prefersReducedMotion()) {
      host.style.transform = '';
      return;
    }
    const y = window.scrollY * this.factor();
    host.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  }
}
