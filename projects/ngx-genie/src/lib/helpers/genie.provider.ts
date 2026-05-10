import {EnvironmentProviders, makeEnvironmentProviders, APP_INITIALIZER} from '@angular/core';
import {GenieRegistryService} from '../services/genie-registry.service';
import {GenieConfig} from '../models/genie-config.model';
import {DEFAULT_GENIE_CONFIG} from '../configs/genie-config';
import {GENIE_CONFIG} from '../tokens/genie-config.token';
import {createGenieInitializer} from '../utils/genie-initializer.util';

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
      useFactory: createGenieInitializer
    }
  ]);
}
