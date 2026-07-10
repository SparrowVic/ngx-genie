import {
  ApplicationConfig, provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import {provideGenie} from 'genie';
import {provideRouter} from '@angular/router';
import {routes} from './app.routes';
import {providePrimeNG} from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import {APP_BRAND, DEFAULT_BRAND} from './core/tokens/brand.token';
import {FEATURE_FLAGS, DEFAULT_FEATURE_FLAGS} from './core/tokens/feature-flags.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideGenie({
      hotkey: 'F1',
      enabled: true,
      visibleOnStart: true,
    }),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.p-dark'
        }
      }
    }),
    {provide: APP_BRAND, useValue: DEFAULT_BRAND},
    {provide: FEATURE_FLAGS, useValue: DEFAULT_FEATURE_FLAGS},
  ]
};
