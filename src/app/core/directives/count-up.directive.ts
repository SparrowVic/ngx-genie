import { Directive, ElementRef, OnDestroy, OnInit, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Animates the host's text from 0 to a target when it scrolls into view. */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly target = input.required<number>({ alias: 'appCountUp' });
  readonly duration = input(1500);
  readonly decimals = input(0);
  readonly suffix = input('');

  private raf = 0;
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    if (!this.isBrowser) {
      this.render(this.target());
      return;
    }
    this.render(0);
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.animate();
            this.observer?.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    this.observer.observe(this.el.nativeElement);
  }

  private animate(): void {
    const start = performance.now();
    const to = this.target();
    const dur = this.duration();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      this.render(to * eased);
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private render(value: number): void {
    const text = value.toLocaleString('en-US', {
      maximumFractionDigits: this.decimals(),
      minimumFractionDigits: this.decimals(),
    });
    this.el.nativeElement.textContent = text + this.suffix();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
  }
}
