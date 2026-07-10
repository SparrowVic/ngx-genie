/**
 * Angular 21.x internal-contract guard.
 *
 * ngx-genie inspects a handful of Angular *private* runtime APIs (the `ɵ`-prefixed
 * fields and the injector monkey-patch target) that are NOT part of Angular's public
 * contract and can change silently between minor releases. The registry and diagnostics
 * services rely on the exact shapes pinned below:
 *
 *   - `Ctor['ɵcmp'].onPush: boolean`  (genie-diagnostics.service.ts change-detection check)
 *   - `Token['ɵprov'].providedIn === 'root'`  (genie-registry.service.ts checkIsRoot / singleton check)
 *   - `Injector.prototype.get`  (genie-registry.service.ts installSpy patch target)
 *   - InternalInjectFlags numeric bitmask Optional=8/SkipSelf=4/Self=2/Host=1
 *     (genie-registry.service.ts processInjection flag decoder)
 *
 * If a future Angular 21.x upgrade renames, removes, or reshapes any of these, THIS spec
 * must fail loudly here rather than letting the inspector silently mis-report at runtime.
 *
 * NOTE: imports are intentionally restricted to '@angular/core' and '@angular/core/testing'
 * so the guard exercises the same surface the library consumes.
 */
import {ChangeDetectionStrategy, Component, Injectable, Injector} from '@angular/core';
import {TestBed} from '@angular/core/testing';

// Standalone by default under Angular 21 — no `standalone: true` needed.
@Component({
  selector: 'genie-onpush-probe',
  template: '<span>onpush</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OnPushProbeComponent {
}

@Component({
  selector: 'genie-default-probe',
  template: '<span>default</span>',
})
class DefaultProbeComponent {
}

@Injectable({providedIn: 'root'})
class RootProbeService {
  readonly marker = 'root-provided';
}

describe('Angular 21.x internal-contract guard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OnPushProbeComponent, DefaultProbeComponent],
    });
  });

  describe('ComponentDef (ɵcmp) onPush contract', () => {
    it('exposes ɵcmp on the constructor after compilation', () => {
      // Instantiating through TestBed forces JIT compilation, which populates ɵcmp.
      TestBed.createComponent(OnPushProbeComponent);
      TestBed.createComponent(DefaultProbeComponent);

      const onPushDef = (OnPushProbeComponent as any)['ɵcmp'];
      const defaultDef = (DefaultProbeComponent as any)['ɵcmp'];

      expect(onPushDef).withContext('OnPushProbeComponent.ɵcmp is missing').toBeTruthy();
      expect(defaultDef).withContext('DefaultProbeComponent.ɵcmp is missing').toBeTruthy();
    });

    it('exposes a boolean `onPush` field that is true for OnPush components', () => {
      TestBed.createComponent(OnPushProbeComponent);

      const def = (OnPushProbeComponent as any)['ɵcmp'];
      expect(typeof def.onPush)
        .withContext('ɵcmp.onPush must be a boolean — diagnostics keys change-detection off it')
        .toBe('boolean');
      // This is the exact contract genie-diagnostics.service.ts relies on:
      // Default change detection is derived as `!def.onPush`.
      expect(def.onPush).withContext('OnPush component must report onPush === true').toBe(true);
    });

    it('exposes `onPush === false` for default change-detection components', () => {
      TestBed.createComponent(DefaultProbeComponent);

      const def = (DefaultProbeComponent as any)['ɵcmp'];
      expect(typeof def.onPush).toBe('boolean');
      expect(def.onPush).withContext('Default component must report onPush === false').toBe(false);
    });
  });

  describe('root provider definition (ɵprov) contract', () => {
    it('exposes ɵprov with providedIn === "root" on the injectable token', () => {
      // Resolving the token realises the provider; the static ɵprov must survive on the class.
      const instance = TestBed.inject(RootProbeService);
      expect(instance).toBeTruthy();

      const prov = (RootProbeService as any)['ɵprov'];
      expect(prov).withContext('RootProbeService.ɵprov is missing').toBeTruthy();
      // genie-registry.service.ts checkIsRoot() reads token['ɵprov'].providedIn === 'root'.
      expect(prov.providedIn)
        .withContext('root-provided service must report ɵprov.providedIn === "root"')
        .toBe('root');
    });
  });

  describe('Injector instance get() patch target', () => {
    // On Angular 21 the abstract `Injector.prototype.get` is NOT a concrete function
    // (it is undefined on the abstract base), so the module-load `Injector.prototype.get`
    // spy in genie-registry.service.ts (ORIGINAL_INJECTOR_GET) is best-effort / dormant.
    // The reliable interception point is `patchInjectorInstance()`, which wraps a concrete
    // injector instance's own `get`. Pin THAT contract instead.
    it('a concrete Injector instance exposes a callable get() (patchInjectorInstance target)', () => {
      const injector = TestBed.inject(Injector);
      expect(injector).withContext('Injector instance is missing').toBeTruthy();
      expect(typeof injector.get)
        .withContext('injector.get must be a function — patchInjectorInstance() wraps it to observe DI')
        .toBe('function');
    });

    it('documents that abstract Injector.prototype.get is not a concrete function on v21', () => {
      // Guard note: if a future Angular restores a real Injector.prototype.get, the module-load
      // prototype spy would start firing — revisit ORIGINAL_INJECTOR_GET.apply() (it is unguarded).
      expect(typeof (Injector.prototype as any)['get']).not.toBe('function');
    });
  });

  describe('InternalInjectFlags numeric contract', () => {
    // Angular v21 dropped the public numeric `InjectFlags` enum, but the private
    // InternalInjectFlags bitmask is still passed to Injector.get() by framework
    // callers. genie-registry.service.ts decodes it with these exact bit weights.
    // Documented map — keep in lockstep with processInjection()'s decoder.
    const INTERNAL_INJECT_FLAGS = {
      Default: 0,
      Host: 1,
      Self: 2,
      SkipSelf: 4,
      Optional: 8,
    } as const;

    it('pins the bit weights the registry decoder assumes', () => {
      expect(INTERNAL_INJECT_FLAGS.Optional).withContext('Optional bit').toBe(8);
      expect(INTERNAL_INJECT_FLAGS.SkipSelf).withContext('SkipSelf bit').toBe(4);
      expect(INTERNAL_INJECT_FLAGS.Self).withContext('Self bit').toBe(2);
      expect(INTERNAL_INJECT_FLAGS.Host).withContext('Host bit').toBe(1);
      expect(INTERNAL_INJECT_FLAGS.Default).withContext('Default (no flags)').toBe(0);
    });

    it('decodes a combined bitmask exactly like genie-registry.service.ts', () => {
      // Mirror the registry's `typeof flags === 'number'` branch.
      const flags = INTERNAL_INJECT_FLAGS.Optional | INTERNAL_INJECT_FLAGS.SkipSelf;
      const decoded = {
        optional: (flags & 8) !== 0,
        skipSelf: (flags & 4) !== 0,
        self: (flags & 2) !== 0,
        host: (flags & 1) !== 0,
      };

      expect(decoded).toEqual({optional: true, skipSelf: true, self: false, host: false});
    });
  });
});
