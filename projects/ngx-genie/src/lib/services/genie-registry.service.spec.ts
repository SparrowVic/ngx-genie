/**
 * Unit spec for GenieRegistryService.
 *
 * Focus (per the library's testing charter):
 *   1. PURE classification logic — describeToken/resolveTokenName, getDependencyType,
 *      checkIsRoot, guessProviderType, isSystemToken/isIgnoredToken/isIgnoredTokenFast.
 *   2. The recently-hardened DI-capture safety code — patchInjectorInstance/restoreInjector,
 *      setCaptureActive, teardownCapture, and the SSR no-op guards.
 *   3. reset() and the trivial getters on an empty registry.
 *
 * Private members are exercised through `(reg as any)` — that is the sanctioned convention in this
 * repo (see angular-internals-compat.spec.ts). We craft ɵ-marked fake tokens/ctors instead of pulling
 * real Angular directives so each branch is isolated and deterministic.
 *
 * The SUT is @Injectable() (NOT root): it is provided in TestBed and depends on ApplicationRef
 * (supplied by TestBed) and the root GenFilterService. It inject()s PLATFORM_ID and DestroyRef, so
 * SSR behaviour is tested with a { provide: PLATFORM_ID, useValue: 'server' } override.
 */
import {InjectionToken, Injector, PLATFORM_ID, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Observable, Subject} from 'rxjs';

import {GenieRegistryService} from './genie-registry.service';
import {GenFilterService} from './filter.service';

/** Build a fresh registry (and its filter service) on either platform. */
function setup(platform: 'browser' | 'server' = 'browser'): {
  reg: GenieRegistryService;
  filter: GenFilterService;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      GenieRegistryService,
      ...(platform === 'server' ? [{provide: PLATFORM_ID, useValue: 'server'}] : []),
    ],
  });
  return {
    reg: TestBed.inject(GenieRegistryService),
    filter: TestBed.inject(GenFilterService),
  };
}

/** A minimal fake Injector shape the private `register()` can consume. */
class FakeInjector {
  get(_token: any, _notFoundValue?: any): any {
    return null;
  }
}

describe('GenieRegistryService', () => {
  let reg: GenieRegistryService;
  let filter: GenFilterService;

  beforeEach(() => {
    // GenFilterService reads/writes localStorage on construction & via an effect — start clean so it
    // always loads its built-in defaults (all internal categories hidden).
    localStorage.clear();
    const created = setup('browser');
    reg = created.reg;
    filter = created.filter;
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // describeToken / resolveTokenName
  // ---------------------------------------------------------------------------
  describe('describeToken / resolveTokenName', () => {
    it('returns a class/function token by its .name', () => {
      class MyService {}
      function myFactory() {}

      expect((reg as any).describeToken(MyService)).toBe('MyService');
      expect((reg as any).describeToken(myFactory)).toBe('myFactory');
    });

    it('strips the "InjectionToken " prefix from an InjectionToken description', () => {
      const token = new InjectionToken<string>('MyTok');
      // toString() is "InjectionToken MyTok"; resolveTokenName removes the leading label.
      expect((reg as any).describeToken(token)).toBe('MyTok');
    });

    it('returns a string token unchanged', () => {
      expect((reg as any).describeToken('SOME_STRING_TOKEN')).toBe('SOME_STRING_TOKEN');
    });

    it('maps falsy tokens (null/undefined/0/""/false) to "Unknown"', () => {
      expect((reg as any).describeToken(null)).withContext('null').toBe('Unknown');
      expect((reg as any).describeToken(undefined)).withContext('undefined').toBe('Unknown');
      expect((reg as any).describeToken(0)).withContext('0 is falsy').toBe('Unknown');
      expect((reg as any).describeToken('')).withContext('empty string is falsy').toBe('Unknown');
      expect((reg as any).describeToken(false)).withContext('false').toBe('Unknown');
    });

    it('maps a truthy non-object/function/string token (number/boolean/symbol) to "Unknown"', () => {
      expect((reg as any).describeToken(42)).withContext('number').toBe('Unknown');
      expect((reg as any).describeToken(true)).withContext('boolean').toBe('Unknown');
      expect((reg as any).describeToken(Symbol('x'))).withContext('symbol').toBe('Unknown');
    });

    it('resolves an object token via its own .name, else its constructor name', () => {
      class Widget {}
      const instance = new Widget();
      // Instances carry no own `name`; fall through to the constructor name.
      expect((reg as any).describeToken(instance)).toBe('Widget');

      // A plain object literal token carries an explicit `name`.
      expect((reg as any).describeToken({name: 'LiteralNamed'})).toBe('LiteralNamed');
    });

    it('returns "Unknown" for a plain {} (constructor is Object) and for a nameless function', () => {
      expect((reg as any).describeToken({})).withContext('plain object').toBe('Unknown');

      const nameless: any = function () {};
      Object.defineProperty(nameless, 'name', {value: ''});
      expect((reg as any).describeToken(nameless)).withContext('empty function name').toBe('Unknown');
    });

    it('caches the resolved name by object identity (mutating .name afterwards has no effect)', () => {
      const token: any = {name: 'OriginalName'};
      expect((reg as any).describeToken(token)).toBe('OriginalName');

      token.name = 'ChangedName';
      expect((reg as any).describeToken(token))
        .withContext('same identity returns the cached name')
        .toBe('OriginalName');

      // A different object with the mutated name is resolved fresh (proves it is identity-keyed).
      expect((reg as any).describeToken({name: 'ChangedName'})).toBe('ChangedName');
    });
  });

  // ---------------------------------------------------------------------------
  // getDependencyType(instance, token)
  // ---------------------------------------------------------------------------
  describe('getDependencyType', () => {
    it('classifies a null instance as "Service"', () => {
      class SomeToken {}
      expect((reg as any).getDependencyType(null, SomeToken)).toBe('Service');
    });

    it('classifies a signal() instance as "Signal"', () => {
      expect((reg as any).getDependencyType(signal(0), null)).toBe('Signal');
    });

    it('classifies an RxJS Subject/Observable as "Observable"', () => {
      expect((reg as any).getDependencyType(new Subject<number>(), null))
        .withContext('Subject')
        .toBe('Observable');
      expect((reg as any).getDependencyType(new Observable<number>(), null))
        .withContext('Observable')
        .toBe('Observable');
    });

    it('classifies via ɵ constructor markers: ɵpipe→Pipe, ɵcmp→Component, ɵdir→Directive', () => {
      class PipeCls {}
      (PipeCls as any).ɵpipe = {};
      class CmpCls {}
      (CmpCls as any).ɵcmp = {};
      class DirCls {}
      (DirCls as any).ɵdir = {};

      expect((reg as any).getDependencyType(new PipeCls(), PipeCls)).toBe('Pipe');
      expect((reg as any).getDependencyType(new CmpCls(), CmpCls)).toBe('Component');
      expect((reg as any).getDependencyType(new DirCls(), DirCls)).toBe('Directive');
    });

    it('classifies token instanceof InjectionToken as "Token" (plain instance, no ɵ marker)', () => {
      const token = new InjectionToken<object>('MyValueToken');
      expect((reg as any).getDependencyType({value: 1}, token)).toBe('Token');
    });

    it('classifies a token whose name is in ANGULAR_CORE_SYSTEM as "System"', () => {
      class ElementRef {}
      expect((reg as any).getDependencyType(new ElementRef(), ElementRef))
        .withContext('ElementRef is core-system')
        .toBe('System');
    });

    it('normalises a leading underscore before the ANGULAR_CORE_SYSTEM lookup', () => {
      // "_NgZone" normalises to "NgZone", which is a core-system name.
      class _NgZone {}
      expect((reg as any).getDependencyType(new _NgZone(), _NgZone)).toBe('System');
    });

    it('classifies a native JS constructor (Date/Map) as "Value"', () => {
      expect((reg as any).getDependencyType(new Date(), Date)).withContext('Date').toBe('Value');
      expect((reg as any).getDependencyType(new Map(), Map)).withContext('Map').toBe('Value');
    });

    it('falls back to "Service" for an ordinary class instance', () => {
      class OrdinaryService {}
      expect((reg as any).getDependencyType(new OrdinaryService(), OrdinaryService)).toBe('Service');
    });

    it('lets a manual type override from GenFilterService win over everything', () => {
      class MyTok {}
      // Without an override a signal is a "Signal"...
      expect((reg as any).getDependencyType(signal(0), MyTok)).toBe('Signal');

      filter.overrideTokenType('MyTok', 'Value');
      // ...the override beats even the Signal/Observable fast-paths.
      expect((reg as any).getDependencyType(signal(0), MyTok))
        .withContext('override beats Signal')
        .toBe('Value');
      // ...and beats the null-instance "Service" default too.
      expect((reg as any).getDependencyType(null, MyTok))
        .withContext('override beats null→Service')
        .toBe('Value');

      // Clearing the override restores the natural classification.
      filter.overrideTokenType('MyTok', null);
      expect((reg as any).getDependencyType(signal(0), MyTok)).toBe('Signal');
    });
  });

  // ---------------------------------------------------------------------------
  // checkIsRoot
  // ---------------------------------------------------------------------------
  describe('checkIsRoot', () => {
    it('is true when ɵprov.providedIn === "root"', () => {
      class RootSvc {}
      (RootSvc as any).ɵprov = {providedIn: 'root'};
      expect((reg as any).checkIsRoot(RootSvc)).toBe(true);
    });

    it('is false when ɵprov.providedIn is something else (e.g. "platform")', () => {
      class PlatformSvc {}
      (PlatformSvc as any).ɵprov = {providedIn: 'platform'};
      expect((reg as any).checkIsRoot(PlatformSvc)).toBe(false);
    });

    it('is falsy when ɵprov is missing or the token is null', () => {
      class NoProv {}
      // NOTE (characterization): the short-circuit returns `undefined` (not `false`) when ɵprov is
      // absent, and `null` for a null token — both falsy, which is all callers rely on.
      expect((reg as any).checkIsRoot(NoProv)).withContext('missing ɵprov').toBeFalsy();
      expect((reg as any).checkIsRoot(null)).withContext('null token').toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // guessProviderType
  // ---------------------------------------------------------------------------
  describe('guessProviderType', () => {
    it('classifies a primitive instance (string/number/boolean) as "Value"', () => {
      class AnyToken {}
      expect((reg as any).guessProviderType(AnyToken, 'hello')).withContext('string').toBe('Value');
      expect((reg as any).guessProviderType(AnyToken, 42)).withContext('number').toBe('Value');
      expect((reg as any).guessProviderType(AnyToken, true)).withContext('boolean').toBe('Value');
    });

    it('classifies token-name === instance-constructor-name as "Class"', () => {
      class Foo {}
      expect((reg as any).guessProviderType(Foo, new Foo())).toBe('Class');
    });

    it('classifies an InjectionToken (with a differently-named instance) as "Value"', () => {
      const token = new InjectionToken<object>('CfgTok');
      // instance ctor name is "Object" (≠ "CfgTok"), so we do not short-circuit to "Class".
      expect((reg as any).guessProviderType(token, {})).toBe('Value');
    });

    it('classifies a function token whose name differs from the instance ctor as "Existing"', () => {
      class Base {}
      class Impl {}
      expect((reg as any).guessProviderType(Base, new Impl())).toBe('Existing');
    });

    it('falls back to "Factory" for a non-function, non-InjectionToken token', () => {
      // String token, object instance whose ctor name differs → none of the earlier branches match.
      expect((reg as any).guessProviderType('SOME_STRING_TOKEN', {})).toBe('Factory');
    });
  });

  // ---------------------------------------------------------------------------
  // isSystemToken / isIgnoredToken / isIgnoredTokenFast
  // ---------------------------------------------------------------------------
  describe('token gating (isSystemToken / isIgnoredToken / isIgnoredTokenFast)', () => {
    it('isSystemToken is true for a default-hidden framework name and false for a custom one', () => {
      class NgIf {}
      class TotallyCustomService {}
      expect((reg as any).isSystemToken(NgIf))
        .withContext('NgIf is in the default-hidden common-directives category')
        .toBe(true);
      expect((reg as any).isSystemToken(TotallyCustomService))
        .withContext('a user service is not internal')
        .toBe(false);
    });

    it('isIgnoredToken matches by object identity (the Injector class)', () => {
      expect((reg as any).isIgnoredToken(Injector)).toBe(true);
    });

    it('isIgnoredToken matches ignored string tokens (GENIE_CONFIG / GENIE_NODE)', () => {
      expect((reg as any).isIgnoredToken('GENIE_CONFIG')).withContext('GENIE_CONFIG').toBe(true);
      expect((reg as any).isIgnoredToken('GENIE_NODE')).withContext('GENIE_NODE').toBe(true);
    });

    it('isIgnoredToken resolves a token by NAME (class or InjectionToken named like an ignored token)', () => {
      // NB: use an ignored name that is NOT imported into this spec — a local class that shadows an
      // import gets renamed by the bundler, which would corrupt its runtime .name.
      class GenieDiagnosticsService {}
      const genieConfigToken = new InjectionToken('GENIE_CONFIG');
      expect((reg as any).isIgnoredToken(GenieDiagnosticsService))
        .withContext('class name resolves to an ignored token')
        .toBe(true);
      expect((reg as any).isIgnoredToken(genieConfigToken))
        .withContext('InjectionToken description resolves to an ignored token')
        .toBe(true);
    });

    it('isIgnoredToken is false for an unrelated token', () => {
      class RandomService {}
      expect((reg as any).isIgnoredToken(RandomService)).toBe(false);
    });

    it('isIgnoredTokenFast only checks identity + string (does NOT resolve names)', () => {
      class GenieDiagnosticsService {}
      const genieConfigToken = new InjectionToken('GENIE_CONFIG');

      // Identity / string hits.
      expect((reg as any).isIgnoredTokenFast(Injector)).withContext('Injector identity').toBe(true);
      expect((reg as any).isIgnoredTokenFast('GENIE_CONFIG')).withContext('string').toBe(true);

      // Name-only matches are intentionally NOT resolved by the fast path.
      expect((reg as any).isIgnoredTokenFast(GenieDiagnosticsService))
        .withContext('class named like an ignored token is NOT caught by the fast path')
        .toBe(false);
      expect((reg as any).isIgnoredTokenFast(genieConfigToken))
        .withContext('InjectionToken named like an ignored token is NOT caught by the fast path')
        .toBe(false);
      expect((reg as any).isIgnoredTokenFast('RandomStr')).withContext('unrelated string').toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DI-capture safety
  // ---------------------------------------------------------------------------
  describe('DI-capture safety', () => {
    let inj: any;
    let originalGet: (t: any, n?: any, f?: any) => any;

    beforeEach(() => {
      inj = {
        get(_token: any, _notFoundValue?: any, _flags?: any): any {
          return 'R';
        },
      };
      originalGet = inj.get;
    });

    describe('patchInjectorInstance', () => {
      it('replaces get with a NEW wrapper function that still returns the original result', () => {
        (reg as any).patchInjectorInstance(inj);
        expect(inj.get).withContext('get was wrapped').not.toBe(originalGet);
        expect(typeof inj.get).toBe('function');
        // Capture is inactive by default → the wrapper is a pure pass-through here.
        expect(inj.get('anyToken')).withContext('wrapper passes the value through').toBe('R');
      });

      it('stores the patch marker as a NON-enumerable Symbol (keys unchanged, symbols +1)', () => {
        const keysBefore = Object.keys(inj);
        const symbolsBefore = Object.getOwnPropertySymbols(inj).length;

        (reg as any).patchInjectorInstance(inj);

        expect(Object.keys(inj))
          .withContext('enumerable string keys are untouched')
          .toEqual(keysBefore);
        expect(Object.getOwnPropertySymbols(inj).length)
          .withContext('exactly one Symbol marker was added')
          .toBe(symbolsBefore + 1);
      });

      it('is idempotent — a second patch keeps the same wrapper and symbol count', () => {
        (reg as any).patchInjectorInstance(inj);
        const wrapperAfterFirst = inj.get;
        const symbolsAfterFirst = Object.getOwnPropertySymbols(inj).length;

        (reg as any).patchInjectorInstance(inj);

        expect(inj.get).withContext('wrapper unchanged on re-patch').toBe(wrapperAfterFirst);
        expect(Object.getOwnPropertySymbols(inj).length)
          .withContext('no additional Symbol on re-patch')
          .toBe(symbolsAfterFirst);
        expect((reg as any)._patchedInjectors.size).toBe(1);
      });

      it('ignores an injector whose get is not a function', () => {
        const weird: any = {get: 'not-a-function'};
        (reg as any).patchInjectorInstance(weird);
        expect(weird.get).toBe('not-a-function');
        expect(Object.getOwnPropertySymbols(weird).length).toBe(0);
      });

      it('ignores null/undefined injectors without throwing', () => {
        expect(() => (reg as any).patchInjectorInstance(null)).not.toThrow();
        expect(() => (reg as any).patchInjectorInstance(undefined)).not.toThrow();
        expect((reg as any)._patchedInjectors.size).toBe(0);
      });
    });

    describe('capture active/inactive gating', () => {
      it('does NOT record while capture is inactive, but DOES once active', () => {
        (reg as any).patchInjectorInstance(inj);
        const handleSpy = spyOn(reg as any, 'handleInjectionEvent');

        reg.setCaptureActive(false);
        expect(inj.get('tokenX')).withContext('still passes value through').toBe('R');
        expect(handleSpy).withContext('inactive → no recording').not.toHaveBeenCalled();

        reg.setCaptureActive(true);
        expect(inj.get('tokenY')).toBe('R');
        expect(handleSpy).withContext('active → records once').toHaveBeenCalledTimes(1);
        const args = handleSpy.calls.mostRecent().args;
        expect(args[0]).withContext('requesting injector = this').toBe(inj);
        expect(args[1]).withContext('token').toBe('tokenY');
        expect(args[2]).withContext('resolved instance').toBe('R');
      });

      it('does not record ignored tokens even while active', () => {
        (reg as any).patchInjectorInstance(inj);
        const handleSpy = spyOn(reg as any, 'handleInjectionEvent');
        reg.setCaptureActive(true);

        expect(inj.get('GENIE_CONFIG')).toBe('R');
        expect(handleSpy)
          .withContext('isIgnoredTokenFast short-circuits before recording')
          .not.toHaveBeenCalled();
      });
    });

    describe('setCaptureActive(false)', () => {
      it('clears the deferred-event buffer and the active flag', () => {
        reg.setCaptureActive(true);
        (reg as any).patchInjectorInstance(inj);

        // Our fake injector maps to no node, so the recorded event is deferred.
        inj.get('DeferredTokenA');
        expect(reg.hasPendingDeferredEvents())
          .withContext('an event was buffered')
          .toBeTrue();

        reg.setCaptureActive(false);
        expect(reg.hasPendingDeferredEvents())
          .withContext('buffer cleared on deactivate')
          .toBeFalse();
        expect((reg as any)._captureActive).toBeFalse();
      });
    });

    describe('restoreInjector', () => {
      it('reverts an OWN get (reassigns original) and removes the marker + set entry', () => {
        (reg as any).patchInjectorInstance(inj);
        expect((reg as any)._patchedInjectors.has(inj)).toBeTrue();

        (reg as any).restoreInjector(inj);

        expect(inj.get).withContext('own get reassigned to the original').toBe(originalGet);
        expect(Object.getOwnPropertySymbols(inj).length)
          .withContext('Symbol marker removed')
          .toBe(0);
        expect((reg as any)._patchedInjectors.has(inj))
          .withContext('dropped from the patched set')
          .toBeFalse();
      });

      it('deletes an INHERITED get so the prototype get shows through again', () => {
        const proto = {
          get(_t: any): any {
            return 'P';
          },
        };
        const inherited: any = Object.create(proto);
        expect(Object.prototype.hasOwnProperty.call(inherited, 'get'))
          .withContext('get is inherited, not own')
          .toBeFalse();

        (reg as any).patchInjectorInstance(inherited);
        expect(Object.prototype.hasOwnProperty.call(inherited, 'get'))
          .withContext('patch installs an own get')
          .toBeTrue();

        (reg as any).restoreInjector(inherited);

        expect(Object.prototype.hasOwnProperty.call(inherited, 'get'))
          .withContext('own get deleted')
          .toBeFalse();
        expect(inherited.get).withContext('prototype get shows through').toBe(proto.get);
        expect(inherited.get('x')).toBe('P');
      });

      it('is a no-op for an un-patched injector', () => {
        expect(() => (reg as any).restoreInjector(inj)).not.toThrow();
        expect(inj.get).toBe(originalGet);
      });
    });

    describe('teardownCapture', () => {
      it('restores every patched injector, clears the buffer and the active flag', () => {
        const inj2: any = {
          get(_t: any): any {
            return 'R2';
          },
        };
        const originalGet2 = inj2.get;

        reg.setCaptureActive(true);
        (reg as any).patchInjectorInstance(inj);
        (reg as any).patchInjectorInstance(inj2);
        inj.get('SomeDeferredToken'); // buffer one deferred event
        expect(reg.hasPendingDeferredEvents()).toBeTrue();
        expect((reg as any)._patchedInjectors.size).toBe(2);

        (reg as any).teardownCapture();

        expect(inj.get).withContext('inj restored').toBe(originalGet);
        expect(inj2.get).withContext('inj2 restored').toBe(originalGet2);
        expect((reg as any)._patchedInjectors.size).withContext('patched set emptied').toBe(0);
        expect(reg.hasPendingDeferredEvents()).withContext('buffer cleared').toBeFalse();
        expect((reg as any)._captureActive).withContext('capture disabled').toBeFalse();
      });
    });

    describe('SSR (PLATFORM_ID = "server")', () => {
      let ssr: GenieRegistryService;

      beforeEach(() => {
        localStorage.clear();
        ssr = setup('server').reg;
      });

      it('patchInjectorInstance is a no-op off the browser', () => {
        const target: any = {
          get(_t: any): any {
            return 'R';
          },
        };
        const before = target.get;
        (ssr as any).patchInjectorInstance(target);
        expect(target.get).withContext('get untouched on the server').toBe(before);
        expect(Object.getOwnPropertySymbols(target).length).toBe(0);
        expect((ssr as any)._patchedInjectors.size).toBe(0);
      });

      it('scanApplicationChunked invokes the callback immediately without scanning', () => {
        const onComplete = jasmine.createSpy('onComplete');
        ssr.scanApplicationChunked(onComplete);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(ssr.nodes()).withContext('no nodes registered on the server').toEqual([]);
      });

      it('scanApplication returns without scanning or activating capture', () => {
        expect(() => ssr.scanApplication()).not.toThrow();
        expect(ssr.nodes()).toEqual([]);
        expect(ssr.services()).toEqual([]);
        expect((ssr as any)._captureActive).withContext('capture stays off on the server').toBeFalse();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------
  describe('reset', () => {
    it('empties the signals, restores patched injectors and resets id counters', () => {
      // Populate node / service / dependency state through the real private paths.
      const node = (reg as any).register('SeedNode', new FakeInjector(), null, 'Element');
      class Foo {}
      const serviceId = (reg as any).registerLazySystemProvider(node.id, Foo, new Foo());
      (reg as any).upsertDependency(node.id, serviceId, 'Foo', {}, 'Direct');

      // And patch a separate injector under active capture.
      const patched: any = {
        get(_t: any): any {
          return 'R';
        },
      };
      const patchedOriginal = patched.get;
      reg.setCaptureActive(true);
      (reg as any).patchInjectorInstance(patched);

      expect(reg.nodes().length).withContext('seeded nodes').toBe(1);
      expect(reg.services().length).withContext('seeded services').toBe(1);
      expect(reg.dependencies().length).withContext('seeded dependencies').toBe(1);
      expect(reg.getServiceById(serviceId)).withContext('service is retrievable').not.toBeNull();

      reg.reset();

      expect(reg.nodes()).withContext('nodes emptied').toEqual([]);
      expect(reg.services()).withContext('services emptied').toEqual([]);
      expect(reg.dependencies()).withContext('dependencies emptied').toEqual([]);
      expect(reg.getServiceById(serviceId)).withContext('service index cleared').toBeNull();
      expect(reg.getNodeById(node.id)).withContext('node index cleared').toBeNull();

      expect(patched.get).withContext('patched injector restored').toBe(patchedOriginal);
      expect((reg as any)._patchedInjectors.size).withContext('patched set cleared').toBe(0);
      expect((reg as any)._captureActive).withContext('capture disabled').toBeFalse();

      // Id counters restart from 1.
      const nodeAfter = (reg as any).register('AfterReset', new FakeInjector(), null, 'Element');
      expect(nodeAfter.id).withContext('_nextNodeId reset to 1').toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Trivial getters on an empty registry
  // ---------------------------------------------------------------------------
  describe('getters on an empty registry', () => {
    it('getServiceById / getNodeById return null for unknown ids', () => {
      expect(reg.getServiceById(999)).toBeNull();
      expect(reg.getNodeById(999)).toBeNull();
    });

    it('getServicesForNode / getDependenciesForNode return empty arrays', () => {
      expect(reg.getServicesForNode(1)).toEqual([]);
      expect(reg.getDependenciesForNode(1)).toEqual([]);
      expect(reg.getDependenciesForService(1)).toEqual([]);
    });

    it('hasPendingDeferredEvents is false with nothing buffered', () => {
      expect(reg.hasPendingDeferredEvents()).toBeFalse();
    });
  });
});
