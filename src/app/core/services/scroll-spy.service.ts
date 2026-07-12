import { Injectable, computed, signal } from '@angular/core';

/**
 * Lightweight store for scroll state. A directive/host observes the viewport and
 * pushes values in; components (nav, progress bar) read the signals out.
 */
@Injectable({ providedIn: 'root' })
export class ScrollSpyService {
  private readonly _active = signal<string>('hero');
  readonly active = this._active.asReadonly();

  /** Vertical scroll progress across the page, 0..1. */
  private readonly _progress = signal(0);
  readonly progress = this._progress.asReadonly();
  readonly progressPercent = computed(() => Math.round(this._progress() * 100));
  readonly scrolled = computed(() => this._progress() > 0.02);

  setActive(id: string): void {
    if (id && id !== this._active()) this._active.set(id);
  }

  setProgress(value: number): void {
    this._progress.set(Math.min(1, Math.max(0, value)));
  }
}
