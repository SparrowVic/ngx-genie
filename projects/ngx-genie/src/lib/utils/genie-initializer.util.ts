import {
  inject
} from '@angular/core';
import {GenieRegistryService} from '../services/genie-registry.service';
import {GENIE_CONFIG} from '../tokens/genie-config.token';

export function createGenieInitializer(): () => void {
  const config = inject(GENIE_CONFIG);
  if (config.enabled) {
    inject(GenieRegistryService);
  }

  return () => {};
}
