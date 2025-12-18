import {
  ApplicationConfig,
} from '@angular/core';
import {provideGenie} from 'genie';
import {provideRouter} from '@angular/router';
import {routes} from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideGenie({
      hotkey: 'F1',
      enabled: true,
      visibleOnStart: true,
    }),
  ]
};
