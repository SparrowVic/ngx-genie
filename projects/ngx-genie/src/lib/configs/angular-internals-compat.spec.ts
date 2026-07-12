/**
 * Angular 21.x internal-contract guard.
 *
 * ngx-genie inspects a handful of Angular *private* runtime APIs (the `ɵ`-prefixed
 * fields, the LView layout, the InjectionToken string format and the injector
 * monkey-patch target) that are NOT part of Angular's public contract and can change
 * silently between releases. The registry and diagnostics services rely on the exact
 * shapes pinned below:
 *
 *   - `Ctor['ɵcmp'].onPush: boolean`            (diagnostics change-detection check)
 *   - `Token['ɵprov'].providedIn === 'root'`    (registry checkIsRoot / singleton check)
 *   - `Ctor['ɵpipe']` / `Ctor['ɵdir']` truthy   (registry getDependencyType classification)
 *   - `new InjectionToken(desc).toString()` starts with `'InjectionToken '`  (registry resolveTokenName)
 *   - `LView[CONTEXT_INDEX(8)] === instance` and `LView[1]` is a TView with a `.data` array
 *                                               (registry scanTemplateDependencies / extractProvidersFromComponent)
 *   - a concrete injector instance exposes a callable `get`  (registry.patchInjectorInstance target)
 *   - InternalInjectFlags numeric bitmask Optional=8/SkipSelf=4/Self=2/Host=1
 *                                               (registry.decodeInjectFlags)
 *
 * If a future Angular upgrade renames, removes, or reshapes any of these, THIS spec must
 * fail loudly here rather than letting the inspector silently mis-report at runtime.
 *
 * NOTE: aside from importing the registry's own `decodeInjectFlags` (so the flag test
 * exercises the real decoder, not a copy), imports are restricted to '@angular/core' and
 * '@angular/core/testing' so the guard exercises the same surface the library consumes.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  InjectionToken,
  Injectable,
  Injector,
  Pipe,
  PipeTransform,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {decodeInjectFlags} from '../services/genie-registry.service';

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

@Pipe({name: 'genieProbePipe'})
class ProbePipe implements PipeTransform {
  transform(value: unknown): unknown {
    return value;
  }
}

@Directive({selector: '[genieProbeDir]'})
class ProbeDirective {
}

@Component({
  selector: 'genie-pipe-dir-host',
  imports: [ProbePipe, ProbeDirective],
  template: '<span genieProbeDir>{{ "x" | genieProbePipe }}</span>',
})
class PipeDirHostComponent {
}

describe('Angular 21.x internal-contract guard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OnPushProbeComponent, DefaultProbeComponent, PipeDirHostComponent],
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

  describe('Pipe/Directive defs (ɵpipe / ɵdir) contract', () => {
    // genie-registry.service.ts getDependencyType() classifies an instance as Pipe/Component/Directive
    // by reading ctor.ɵpipe / ctor.ɵcmp / ctor.ɵdir. If a reshape drops these, every pipe/directive
    // would silently fall through to 'Service'.
    it('populates ɵpipe on a @Pipe and ɵdir on a @Directive after compilation', () => {
      // Rendering a host that imports both forces their compilation.
      const fixture = TestBed.createComponent(PipeDirHostComponent);
      fixture.detectChanges();

      expect((ProbePipe as any)['ɵpipe'])
        .withContext('@Pipe must expose ɵpipe — getDependencyType returns "Pipe" off it')
        .toBeTruthy();
      expect((ProbeDirective as any)['ɵdir'])
        .withContext('@Directive must expose ɵdir — getDependencyType returns "Directive" off it')
        .toBeTruthy();
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

  describe('InjectionToken.toString() format contract', () => {
    it('formats as "InjectionToken <description>"', () => {
      // genie-registry.service.ts resolveTokenName() derives a token label via
      // token.toString().replace('InjectionToken ', ''). Pin that format.
      const token = new InjectionToken<string>('MyGenieToken');
      const str = token.toString();
      expect(str)
        .withContext('InjectionToken.toString() must start with "InjectionToken "')
        .toMatch(/^InjectionToken /);
      expect(str.replace('InjectionToken ', ''))
        .withContext('stripping the prefix must yield the raw description')
        .toBe('MyGenieToken');
    });
  });

  describe('LView layout contract', () => {
    // genie-registry.service.ts reads the component's LView off ChangeDetectorRef._lView, treats
    // index 8 (CONTEXT_INDEX) as the component instance, and iterates LView[1] (TView).data.
    const CONTEXT_INDEX = 8;

    it('exposes _lView on the component ChangeDetectorRef with the instance at CONTEXT_INDEX', () => {
      const fixture = TestBed.createComponent(DefaultProbeComponent);
      fixture.detectChanges();

      const cdr = fixture.componentRef.injector.get(ChangeDetectorRef) as any;
      const lView = cdr._lView;

      expect(lView)
        .withContext('ChangeDetectorRef._lView is missing — scanTemplateDependencies reads it')
        .toBeTruthy();
      expect(lView[CONTEXT_INDEX])
        .withContext('LView[CONTEXT_INDEX(8)] must be the component instance')
        .toBe(fixture.componentInstance);
    });

    it('exposes a TView at LView[1] with an iterable data array', () => {
      const fixture = TestBed.createComponent(DefaultProbeComponent);
      fixture.detectChanges();

      const cdr = fixture.componentRef.injector.get(ChangeDetectorRef) as any;
      const tView = cdr._lView[1];

      expect(tView).withContext('LView[1] (TView) is missing').toBeTruthy();
      expect(Array.isArray(tView.data))
        .withContext('TView.data must be an array — extractProvidersFromComponent iterates it')
        .toBe(true);
    });
  });

  describe('Injector instance get() patch target', () => {
    // The reliable interception point is registry.patchInjectorInstance(), which wraps a *concrete*
    // injector instance's own `get`. (The registry deliberately does NOT patch Injector.prototype —
    // its abstract `get` is undefined on v21 and never invoked; the second test documents that.)
    it('a concrete Injector instance exposes a callable get() (patchInjectorInstance target)', () => {
      const injector = TestBed.inject(Injector);
      expect(injector).withContext('Injector instance is missing').toBeTruthy();
      expect(typeof injector.get)
        .withContext('injector.get must be a function — patchInjectorInstance() wraps it to observe DI')
        .toBe('function');
    });

    it('confirms abstract Injector.prototype.get is not a concrete function on v21', () => {
      // This is WHY the registry patches per-instance instead of the prototype: the abstract base
      // has no callable get, so a prototype patch would be dead code (and unsafe to .apply()).
      // If a future Angular restores a real Injector.prototype.get, revisit that decision.
      expect(typeof (Injector.prototype as any)['get']).not.toBe('function');
    });
  });

  describe('InternalInjectFlags numeric contract (via the real registry decoder)', () => {
    // Angular v21 dropped the public numeric `InjectFlags` enum, but the private
    // InternalInjectFlags bitmask is still passed to Injector.get() by framework callers.
    // These bit weights are what genie-registry.service.ts decodeInjectFlags() assumes.
    const INTERNAL_INJECT_FLAGS = {
      Default: 0,
      Host: 1,
      Self: 2,
      SkipSelf: 4,
      Optional: 8,
    } as const;

    it('decodes each single flag bit exactly', () => {
      expect(decodeInjectFlags(INTERNAL_INJECT_FLAGS.Optional))
        .toEqual({optional: true, skipSelf: false, self: false, host: false});
      expect(decodeInjectFlags(INTERNAL_INJECT_FLAGS.SkipSelf))
        .toEqual({optional: false, skipSelf: true, self: false, host: false});
      expect(decodeInjectFlags(INTERNAL_INJECT_FLAGS.Self))
        .toEqual({optional: false, skipSelf: false, self: true, host: false});
      expect(decodeInjectFlags(INTERNAL_INJECT_FLAGS.Host))
        .toEqual({optional: false, skipSelf: false, self: false, host: true});
    });

    it('decodes a combined bitmask (Optional | SkipSelf)', () => {
      const flags = INTERNAL_INJECT_FLAGS.Optional | INTERNAL_INJECT_FLAGS.SkipSelf;
      expect(decodeInjectFlags(flags))
        .toEqual({optional: true, skipSelf: true, self: false, host: false});
    });

    it('decodes the modern InjectOptions object form', () => {
      expect(decodeInjectFlags({optional: true, self: true}))
        .toEqual({optional: true, skipSelf: false, self: true, host: false});
    });

    it('treats Default (0) / undefined as no flags', () => {
      expect(decodeInjectFlags(INTERNAL_INJECT_FLAGS.Default))
        .toEqual({optional: false, skipSelf: false, self: false, host: false});
      expect(decodeInjectFlags(undefined))
        .toEqual({optional: false, skipSelf: false, self: false, host: false});
    });
  });
});
