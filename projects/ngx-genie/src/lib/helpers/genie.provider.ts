import {EnvironmentProviders, makeEnvironmentProviders, APP_INITIALIZER, inject, ApplicationRef} from '@angular/core';
import {GenieRegistryService} from '../services/genie-registry.service';
import {GenieConfig} from '../models/genie-config.model';
import {DEFAULT_GENIE_CONFIG} from '../configs/genie-config';
import {GENIE_CONFIG} from '../tokens/genie-config.token';

export function provideGenie(config: Partial<GenieConfig> = {}): EnvironmentProviders {
  const merged: GenieConfig = {
    ...DEFAULT_GENIE_CONFIG,
    ...config,
  };

  return makeEnvironmentProviders([
    GenieRegistryService,
    {
      provide: GENIE_CONFIG,
      useValue: merged,
    },

    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const registry = inject(GenieRegistryService);
        const appRef = inject(ApplicationRef);

        return () => {

          const sub = appRef.isStable.subscribe(isStable => {
            if (isStable) {

              setTimeout(() => registry.scanApplication(), 500);
              sub.unsubscribe();
            }
          });
        };
      }
    }
  ]);
}
