import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * A single ticking clock shared across the app. Consumers derive time-relative
 * values (e.g. the TimeAgo pipe) from the `now` signal instead of each spinning
 * up their own interval.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly boot = Date.now();

  private readonly _now = signal<number>(this.boot);
  readonly now = this._now.asReadonly();

  /** Seconds since the app booted — handy for "uptime" style displays. */
  readonly uptimeSeconds = computed(() => Math.floor((this._now() - this.boot) / 1000));

  constructor() {
    if (!this.isBrowser) return;
    const id = setInterval(() => this._now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }
}
