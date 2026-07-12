import { Injectable, inject } from '@angular/core';
import { GENIE_CONFIG } from 'genie';

/**
 * The demo's single source of truth for the overlay hotkey label.
 *
 * It reads the *resolved* GenieOS config (see `provideGenie(...)` in
 * `app.config.ts`), so every "press X" affordance and setup snippet across the
 * site reflects whatever hotkey the app is actually configured with. Change the
 * `hotkey` in `app.config.ts` and the whole demo follows — falling back to `F1`
 * when none is set.
 */
@Injectable({ providedIn: 'root' })
export class HotkeyService {
  private readonly config = inject(GENIE_CONFIG);

  /** The configured hotkey label, e.g. `'F1'`. Defaults to `'F1'` when unset. */
  readonly key = this.config.hotkey?.trim() || 'F1';
}
