import { Directive, ElementRef, OnDestroy, OnInit, PLATFORM_ID, inject, input, numberAttribute } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { prefersReducedMotion } from './reduced-motion';

/**
 * Reveals the host on scroll via IntersectionObserver. The `[attr.data-reveal]`
 * hook is styled globally (hidden → visible). Optional stagger delay in ms.
 */
@Directive({
  standalone: true,
  selector: '[appReveal]',
  host: { '[attr.data-reveal]': '""' },
})
export class RevealOnScrollDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly delay = input(0, { alias: 'appReveal', transform: (v: unknown) => numberAttribute(v, 0) });
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const host = this.el.nativeElement;
    // Reveal immediately on the server and under reduced motion — no observer work.
    if (!this.isBrowser || prefersReducedMotion()) {
      host.classList.add('is-revealed');
      return;
    }
    if (this.delay()) host.style.transitionDelay = `${this.delay()}ms`;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            host.classList.add('is-revealed');
            this.observer?.unobserve(host);
          }
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    );
    this.observer.observe(host);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
