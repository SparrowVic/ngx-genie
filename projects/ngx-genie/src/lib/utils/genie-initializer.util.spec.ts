/**
 * Unit spec for createGenieInitializer() — the app-initializer factory wired into
 * provideGenie() / GenieModule via provideAppInitializer(createGenieInitializer).
 *
 * SUT (utils/genie-initializer.util.ts):
 *
 *   export function createGenieInitializer(): void {
 *     const config = inject(GENIE_CONFIG);
 *     if (config.enabled && isPlatformBrowser(inject(PLATFORM_ID))) {
 *       inject(GenieRegistryService);
 *     }
 *   }
 *
 * Contract under test:
 *   - Runs inside an Angular injection context (uses inject()).
 *   - ALWAYS injects GENIE_CONFIG.
 *   - Only constructs GenieRegistryService (which installs the DI-capture spy) when BOTH
 *     `config.enabled` is truthy AND the platform is a browser.
 *   - The `&&` short-circuit means PLATFORM_ID is only read when `config.enabled` is truthy.
 *   - During SSR (PLATFORM_ID === 'server') the registry is never constructed — the guard that
 *     prevents injector patches from leaking across server requests.
 *
 * Test seam: we DO NOT use the real GenieRegistryService (constructing it installs the real
 * injector spy). Instead we register a `useFactory` sentinel for the GenieRegistryService token
 * that flips a flag / bumps a counter when Angular realises it, and we assert on that. Because the
 * real class is `@Injectable()` with NO `providedIn`, a TestBed provider fully replaces it.
 */
import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {createGenieInitializer} from './genie-initializer.util';
import {GENIE_CONFIG} from '../tokens/genie-config.token';
import {GenieRegistryService} from '../services/genie-registry.service';
import {GenieConfig} from '../models/genie-config.model';

describe('createGenieInitializer', () => {
  // Sentinel state for the registry factory. Reset in beforeEach so each test is isolated.
  let registryCreated: boolean;
  let registryCreateCount: number;

  /**
   * Configure a fresh TestBed with a GENIE_CONFIG, a platform id, and the registry sentinel.
   * The registry factory returns a plain object cast to `any` so nothing real is instantiated.
   */
  function configure(config: GenieConfig, platformId: unknown): void {
    TestBed.configureTestingModule({
      providers: [
        {provide: GENIE_CONFIG, useValue: config},
        {provide: PLATFORM_ID, useValue: platformId},
        {
          provide: GenieRegistryService,
          useFactory: () => {
            registryCreated = true;
            registryCreateCount += 1;
            // A faithful-enough stand-in: the initializer never touches the instance, it only
            // forces construction. An empty object is all the contract requires.
            return {} as unknown as GenieRegistryService;
          },
        },
      ],
    });
  }

  /** Run the SUT inside a real injection context, exactly like provideAppInitializer would. */
  function runInitializer(): void {
    TestBed.runInInjectionContext(() => createGenieInitializer());
  }

  const enabledConfig: GenieConfig = {hotkey: 'ctrl.g', enabled: true, visibleOnStart: false};
  const disabledConfig: GenieConfig = {hotkey: 'ctrl.g', enabled: false, visibleOnStart: false};

  beforeEach(() => {
    registryCreated = false;
    registryCreateCount = 0;
  });

  describe('browser platform (PLATFORM_ID === "browser")', () => {
    it('constructs GenieRegistryService when enabled === true', () => {
      configure(enabledConfig, 'browser');

      runInitializer();

      expect(registryCreated)
        .withContext('enabled + browser must realise the registry (installs the DI spy)')
        .toBe(true);
    });

    it('does NOT construct GenieRegistryService when enabled === false', () => {
      configure(disabledConfig, 'browser');

      runInitializer();

      expect(registryCreated)
        .withContext('disabled config must skip the registry even in the browser')
        .toBe(false);
    });
  });

  describe('server platform (SSR guard, PLATFORM_ID === "server")', () => {
    it('does NOT construct GenieRegistryService even when enabled === true', () => {
      // This is the just-added guard: patching injectors on the server would leak DI-capture
      // state across requests, so the registry must stay dormant during SSR.
      configure(enabledConfig, 'server');

      runInitializer();

      expect(registryCreated)
        .withContext('SSR + enabled must NOT install the injector spy')
        .toBe(false);
    });

    it('does NOT construct GenieRegistryService when enabled === false', () => {
      configure(disabledConfig, 'server');

      runInitializer();

      expect(registryCreated)
        .withContext('disabled + server: registry must never be created')
        .toBe(false);
    });
  });

  describe('return value', () => {
    it('returns undefined (void) in the browser-enabled path', () => {
      configure(enabledConfig, 'browser');

      let result: unknown = 'sentinel';
      TestBed.runInInjectionContext(() => {
        result = createGenieInitializer();
      });

      expect(result)
        .withContext('createGenieInitializer is declared : void')
        .toBeUndefined();
    });

    it('returns undefined (void) in the disabled/no-op path', () => {
      configure(disabledConfig, 'browser');

      let result: unknown = 'sentinel';
      TestBed.runInInjectionContext(() => {
        result = createGenieInitializer();
      });

      expect(result).toBeUndefined();
    });
  });

  describe('registry singleton behaviour', () => {
    it('realises the registry at most once when invoked twice in the same injection context', () => {
      // provideAppInitializer runs the factory once, but injecting a token twice must not
      // reconstruct it — the DI-scoped instance is cached. Characterises that inject() is idempotent.
      configure(enabledConfig, 'browser');

      TestBed.runInInjectionContext(() => {
        createGenieInitializer();
        createGenieInitializer();
      });

      expect(registryCreateCount)
        .withContext('GenieRegistryService is a singleton in its injector — factory runs once')
        .toBe(1);
    });
  });

  describe('enabled short-circuit (config.enabled && isPlatformBrowser(...))', () => {
    // The `&&` guarantees PLATFORM_ID is only read when enabled is truthy. We prove this by
    // wiring PLATFORM_ID through a factory that records whether it was ever requested.
    //
    // NOTE: A `useFactory` provider is invoked lazily on first inject() and then cached, so this
    // probe is only reliable when NO other consumer resolves PLATFORM_ID first. We isolate that by
    // (a) giving each test its own TestBed and (b) making the initializer the very first thing to
    // touch the token in this fixture.

    function configureWithPlatformProbe(config: GenieConfig, platformValue: unknown): {
      wasPlatformInjected: () => boolean;
    } {
      let platformInjected = false;
      TestBed.configureTestingModule({
        providers: [
          {provide: GENIE_CONFIG, useValue: config},
          {
            provide: PLATFORM_ID,
            useFactory: () => {
              platformInjected = true;
              return platformValue;
            },
          },
          {
            provide: GenieRegistryService,
            useFactory: () => {
              registryCreated = true;
              registryCreateCount += 1;
              return {} as unknown as GenieRegistryService;
            },
          },
        ],
      });
      return {wasPlatformInjected: () => platformInjected};
    }

    it('reads PLATFORM_ID when enabled === true', () => {
      const probe = configureWithPlatformProbe(enabledConfig, 'browser');

      runInitializer();

      expect(probe.wasPlatformInjected())
        .withContext('enabled path must evaluate the isPlatformBrowser(inject(PLATFORM_ID)) branch')
        .toBe(true);
      expect(registryCreated).toBe(true);
    });

    it('does NOT read PLATFORM_ID when enabled === false (short-circuit)', () => {
      const probe = configureWithPlatformProbe(disabledConfig, 'browser');

      runInitializer();

      expect(probe.wasPlatformInjected())
        .withContext('&& short-circuits before inject(PLATFORM_ID) when enabled is false')
        .toBe(false);
      expect(registryCreated).toBe(false);
    });
  });

  describe('injection-context requirement', () => {
    it('throws when called outside an Angular injection context', () => {
      configure(enabledConfig, 'browser');

      // inject() is only legal inside an injection context; calling the initializer bare must throw.
      expect(() => createGenieInitializer())
        .withContext('createGenieInitializer relies on inject() and must run in an injection context')
        .toThrow();
    });
  });
});
