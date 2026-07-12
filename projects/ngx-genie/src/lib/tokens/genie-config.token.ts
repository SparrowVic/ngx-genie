import {InjectionToken} from '@angular/core';
import {GenieConfig} from '../models/genie-config.model';

/**
 * Injection token holding the fully-resolved {@link GenieConfig} — the object you
 * passed to `provideGenie()` (or `GenieModule.forRoot()`) merged over the library
 * defaults. Inject it anywhere in your app to read the settings GenieOS is
 * actually running with, e.g. to surface the configured `hotkey` in your own UI:
 *
 * ```ts
 * private readonly config = inject(GENIE_CONFIG);
 * readonly hotkey = this.config.hotkey ?? 'F1';
 * ```
 */
export const GENIE_CONFIG = new InjectionToken<GenieConfig>('GENIE_CONFIG');
