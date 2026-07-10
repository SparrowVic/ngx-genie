import { InjectionToken } from '@angular/core';

export interface FeatureFlags {
  readonly liveMetrics: boolean;
  readonly commandPalette: boolean;
  readonly cosmicBackground: boolean;
  readonly soundFx: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  liveMetrics: true,
  commandPalette: true,
  cosmicBackground: true,
  soundFx: false,
};

/**
 * Runtime feature flags. Provided at the app root so the DI inspector can show a
 * token → value provider distinct from the class-based services.
 */
export const FEATURE_FLAGS = new InjectionToken<FeatureFlags>('FEATURE_FLAGS', {
  factory: () => DEFAULT_FEATURE_FLAGS,
});
