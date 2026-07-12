import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'cosmic' | 'light';

const STORAGE_KEY = 'genie-os-theme';

/**
 * Reactive theme controller. A single writable signal drives an effect that
 * mirrors the mode onto <html> (data-theme) and localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly _mode = signal<ThemeMode>(this.readInitial());
  readonly mode = this._mode.asReadonly();
  readonly isDark = computed(() => this._mode() === 'cosmic');
  readonly label = computed(() => (this.isDark() ? 'Cosmic' : 'Daylight'));
  readonly icon = computed(() => (this.isDark() ? 'moon' : 'sun'));

  constructor() {
    effect(() => {
      const mode = this._mode();
      if (!this.isBrowser) return;
      const root = document.documentElement;
      root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        /* storage unavailable — non-fatal */
      }
    });
  }

  toggle(): void {
    this._mode.update((m) => (m === 'cosmic' ? 'light' : 'cosmic'));
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private readInitial(): ThemeMode {
    if (!this.isBrowser) return 'cosmic';
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === 'cosmic' || saved === 'light') return saved;
    } catch {
      /* ignore */
    }
    return 'cosmic';
  }
}
