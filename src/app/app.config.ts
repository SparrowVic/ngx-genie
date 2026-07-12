import {
  ApplicationConfig, provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import {IMAGE_CONFIG} from '@angular/common';
import {provideGenie} from 'genie';
import {provideRouter} from '@angular/router';
import {routes} from './app.routes';
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
      visibleOnStart: false,
    }),
    {provide: APP_BRAND, useValue: DEFAULT_BRAND},
    {provide: FEATURE_FLAGS, useValue: DEFAULT_FEATURE_FLAGS},
    // Product screenshots ship at 2x their rendered size for retina displays,
    // which trips the dev-mode oversized-image heuristic on 1x screens.
    {provide: IMAGE_CONFIG, useValue: {disableImageSizeWarning: true}},
  ]
};
