import {
  inject,
  PLATFORM_ID
} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {GenieRegistryService} from '../services/genie-registry.service';
import {GENIE_CONFIG} from '../tokens/genie-config.token';

export function createGenieInitializer(): void {
  const config = inject(GENIE_CONFIG);
  // Only spin up the registry (which installs the DI-capture spy) in the browser — never during
  // server-side rendering, where patching injectors would leak across requests.
  if (config.enabled && isPlatformBrowser(inject(PLATFORM_ID))) {
    inject(GenieRegistryService);
  }
}
