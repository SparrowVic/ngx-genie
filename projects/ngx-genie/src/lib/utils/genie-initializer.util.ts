import {
  ApplicationRef,
  NgZone,
  PLATFORM_ID,
  inject
} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {GenieRegistryService} from '../services/genie-registry.service';

const STABLE_SCAN_DELAY_MS = 500;
const FALLBACK_SCAN_DELAYS_MS = [750, 2500];

export function createGenieInitializer(): () => void {
  const registry = inject(GenieRegistryService);
  const appRef = inject(ApplicationRef);
  const zone = inject(NgZone);
  const platformId = inject(PLATFORM_ID);

  return () => {
    if (!isPlatformBrowser(platformId)) return;
    scheduleInitialScans(registry, appRef, zone);
  };
}

function scheduleInitialScans(
  registry: GenieRegistryService,
  appRef: ApplicationRef,
  zone: NgZone
): void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stableScanQueued = false;
  let shouldUnsubscribeStable = false;
  let stableSub: {unsubscribe(): void} | null = null;

  const runScan = () => {
    try {
      registry.scanApplication();
    } catch (error) {
      console.warn('[Genie] Initial application scan failed.', error);
    }
  };

  const queueScan = (delay: number) => {
    zone.runOutsideAngular(() => {
      const timer = setTimeout(() => zone.run(runScan), delay);
      timers.push(timer);
    });
  };

  stableSub = appRef.isStable.subscribe(isStable => {
    if (!isStable || stableScanQueued) return;
    stableScanQueued = true;
    queueScan(STABLE_SCAN_DELAY_MS);
    if (stableSub) {
      stableSub.unsubscribe();
      stableSub = null;
    } else {
      shouldUnsubscribeStable = true;
    }
  });

  if (shouldUnsubscribeStable) {
    stableSub?.unsubscribe();
    stableSub = null;
  }

  FALLBACK_SCAN_DELAYS_MS.forEach(queueScan);

  appRef.onDestroy(() => {
    stableSub?.unsubscribe();
    timers.forEach(timer => clearTimeout(timer));
  });
}
