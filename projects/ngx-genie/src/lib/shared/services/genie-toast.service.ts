import {Injectable, PLATFORM_ID, computed, inject, signal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';

export type GenieToastKind = 'success' | 'error' | 'info';

export interface GenieToast {
  message: string;
  kind: GenieToastKind;
}

const DEFAULT_DURATION_MS = 2400;

/**
 * Tiny signal-based toast bus. Any part of the overlay calls `show()` (or the `success`/`error`/`info`
 * shortcuts) and the shared `<gen-toast>` component — rendered once inside the overlay window — reflects
 * the current message and auto-dismisses. Root-provided so a single toast surface serves the whole tool.
 */
@Injectable({providedIn: 'root'})
export class GenieToastService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly _toast = signal<GenieToast | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The currently visible toast, or `null`. Drives the shared `<gen-toast>` overlay component. */
  readonly toast = computed(() => this._toast());

  show(message: string, kind: GenieToastKind = 'success', durationMs = DEFAULT_DURATION_MS): void {
    if (this.timer) clearTimeout(this.timer);
    this._toast.set({message, kind});
    if (this.isBrowser && durationMs > 0) {
      this.timer = setTimeout(() => this._toast.set(null), durationMs);
    }
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._toast.set(null);
  }
}
