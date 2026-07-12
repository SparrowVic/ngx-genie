import { InjectionToken } from '@angular/core';

export interface BrandConfig {
  readonly name: string;
  readonly codename: string;
  readonly tagline: string;
  readonly version: string;
  readonly npm: string;
  readonly github: string;
  readonly docs: string;
  readonly accents: readonly string[];
}

export const DEFAULT_BRAND: BrandConfig = {
  name: 'GenieOS',
  codename: 'ngx-genie',
  tagline: 'Summon your Angular dependency graph',
  version: '22.0.0-beta.1',
  npm: 'https://www.npmjs.com/package/ngx-genie',
  github: 'https://github.com/SparrowVic/ngx-genie',
  docs: '/docs',
  accents: ['#22d3ee', '#6366f1', '#8b5cf6', '#ec4899'],
};

/**
 * Brand configuration token. Provided at the app root (see app.config.ts) so it
 * shows up as a value provider in the GenieOS dependency inspector.
 */
export const APP_BRAND = new InjectionToken<BrandConfig>('APP_BRAND', {
  factory: () => DEFAULT_BRAND,
});
