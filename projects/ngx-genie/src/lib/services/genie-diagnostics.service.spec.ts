import {TestBed} from '@angular/core/testing';
import {computed, signal} from '@angular/core';

import {
  Anomaly,
  AnomalySeverity,
  DEFAULT_DIAGNOSTICS_CONFIG,
  DiagnosticsConfig,
  DiagnosticsProgress,
  DiagnosticsReport,
  GenieDiagnosticsService,
} from './genie-diagnostics.service';
import {GenieRegistryService} from './genie-registry.service';
import {
  GenieDependency,
  GenieNode,
  GenieServiceRegistration,
} from '../models/genie-node.model';

/**
 * Unit spec for GenieDiagnosticsService.
 *
 * The SUT injects GenieRegistryService and only ever reads its `services()`, `nodes()` and
 * `dependencies()` zero-arg signal getters. We replace the registry with a hand-rolled fake whose
 * getters return mutable backing arrays we set per test, so we can feed crafted
 * GenieServiceRegistration[] / GenieNode[] / GenieDependency[] shapes.
 *
 * All scheduling in runDiagnosticsChunked is driven through the private scheduleDiagnosticsChunk,
 * which we stub — we never depend on a real requestIdleCallback/setTimeout firing.
 */

// ---------------------------------------------------------------------------
// Fake registry
// ---------------------------------------------------------------------------

interface FakeRegistry {
  servicesData: GenieServiceRegistration[];
  nodesData: GenieNode[];
  dependenciesData: GenieDependency[];
  services: () => GenieServiceRegistration[];
  nodes: () => GenieNode[];
  dependencies: () => GenieDependency[];
}

function createFakeRegistry(): FakeRegistry {
  const fake: FakeRegistry = {
    servicesData: [],
    nodesData: [],
    dependenciesData: [],
    services: () => fake.servicesData,
    nodes: () => fake.nodesData,
    dependencies: () => fake.dependenciesData,
  };
  return fake;
}

// ---------------------------------------------------------------------------
// Model builders (faithful to the real shapes the SUT reads)
// ---------------------------------------------------------------------------

let nextSvcId = 1;

function svcReg(overrides: Partial<GenieServiceRegistration> = {}): GenieServiceRegistration {
  return {
    id: nextSvcId++,
    nodeId: 1,
    token: {},
    instance: null,
    label: 'Svc',
    providerType: 'Class',
    usageCount: 1, // default non-zero so services don't accidentally read as "zombie"
    properties: {},
    isFramework: false,
    dependencyType: 'Service',
    ...overrides,
  };
}

function nodeReg(overrides: Partial<GenieNode> = {}): GenieNode {
  return {
    id: 1,
    label: 'Node',
    injector: null as any,
    type: 'Element',
    parentId: null,
    isActive: true,
    ...overrides,
  };
}

function depsFor(consumerNodeId: number, count: number): GenieDependency[] {
  return Array.from({length: count}, (_unused, i) => ({
    consumerNodeId,
    providerId: null,
    tokenName: `Tok${i}`,
    type: 'Direct' as const,
    flags: {},
    resolutionPath: [],
  }));
}

/** Array of `n` distinct numbers — arr[0] is a primitive so estimateSize does NOT sample. */
function nums(n: number): number[] {
  return Array.from({length: n}, (_unused, i) => i);
}

/**
 * A value whose `constructor.name === 'Injector'` — exactly what hasInjectorReference scans for.
 * We fake the constructor directly rather than relying on a `class Injector {}` name surviving the
 * build's identifier handling.
 */
function makeInjectorLike(): any {
  return {constructor: {name: 'Injector'}};
}

// A base config with every check OFF — focused tests flip on exactly what they exercise.
const ALL_OFF: DiagnosticsConfig = {
  checkSingleton: false,
  checkHeavyState: false,
  checkUnused: false,
  checkCoupling: false,
  checkChangeDetection: false,
  checkLargeApi: false,
  checkCircular: false,
  checkCleanup: false,
  thresholdHeavyState: 500,
  thresholdCoupling: 12,
  thresholdLargeApi: 30,
};

function makeConfig(overrides: Partial<DiagnosticsConfig> = {}): DiagnosticsConfig {
  return {...ALL_OFF, ...overrides};
}

function anomalyOf(id: string, report: DiagnosticsReport): Anomaly | undefined {
  return report.anomalies.find(a => a.id === id);
}

function sortById(anomalies: Anomaly[]): Anomaly[] {
  return [...anomalies].sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------

describe('GenieDiagnosticsService', () => {
  let svc: GenieDiagnosticsService;
  let fake: FakeRegistry;

  beforeEach(() => {
    nextSvcId = 1;
    fake = createFakeRegistry();
    TestBed.configureTestingModule({
      providers: [
        GenieDiagnosticsService,
        {provide: GenieRegistryService, useValue: fake as unknown as GenieRegistryService},
      ],
    });
    svc = TestBed.inject(GenieDiagnosticsService);
  });

  it('returns a pristine report (score 100, no anomalies) for an empty registry', () => {
    const report = svc.runDiagnostics();
    expect(report.score).withContext('empty registry => perfect integrity').toBe(100);
    expect(report.anomalies).toEqual([]);
  });

  it('uses DEFAULT_DIAGNOSTICS_CONFIG when called with no argument', () => {
    // Two ROOT non-framework instances of the same label => critical split-singleton, which only
    // appears if the default config has checkSingleton enabled.
    fake.servicesData = [
      svcReg({label: 'RootStore', isRoot: true}),
      svcReg({label: 'RootStore', isRoot: true}),
    ];
    const report = svc.runDiagnostics();
    expect(DEFAULT_DIAGNOSTICS_CONFIG.checkSingleton).toBeTrue();
    expect(anomalyOf('sing-RootStore', report)?.severity).toBe('critical');
  });

  // -------------------------------------------------------------------------
  // singleton-violation
  // -------------------------------------------------------------------------

  describe('singleton-violation check', () => {
    const cfg = makeConfig({checkSingleton: true});

    it('flags >1 ROOT non-framework instances as CRITICAL sing-* (isRoot flag path)', () => {
      fake.servicesData = [
        svcReg({id: 10, label: 'CartStore', isRoot: true}),
        svcReg({id: 11, label: 'CartStore', isRoot: true}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('sing-CartStore', report)!;
      expect(a.type).toBe('singleton-violation');
      expect(a.severity).toBe('critical');
      expect(a.isFramework).toBeFalse();
      expect(a.category).toBe('architecture');
      expect(a.relatedServiceIds).withContext('collects every instance id').toEqual([10, 11]);
    });

    it('treats token.ɵprov.providedIn === "root" as ROOT even without isRoot', () => {
      const rootToken = {['ɵprov']: {providedIn: 'root'}};
      fake.servicesData = [
        svcReg({label: 'ProvidedInRoot', isRoot: false, token: rootToken}),
        svcReg({label: 'ProvidedInRoot', isRoot: false, token: rootToken}),
      ];
      const report = svc.runDiagnostics(cfg);
      expect(anomalyOf('sing-ProvidedInRoot', report)?.severity)
        .withContext('providedIn root => critical split singleton')
        .toBe('critical');
    });

    it('downgrades a ROOT FRAMEWORK split singleton to INFO', () => {
      fake.servicesData = [
        svcReg({label: 'NgRootThing', isRoot: true, isFramework: true}),
        svcReg({label: 'NgRootThing', isRoot: true, isFramework: true}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('sing-NgRootThing', report)!;
      expect(a.severity).toBe('info');
      expect(a.isFramework).toBeTrue();
    });

    it('flags >1 NON-root NON-framework instances as WARNING dup-*', () => {
      fake.servicesData = [
        svcReg({id: 5, label: 'PerCompState'}),
        svcReg({id: 6, label: 'PerCompState'}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('dup-PerCompState', report)!;
      expect(a.type).toBe('singleton-violation');
      expect(a.severity).toBe('warning');
      expect(a.relatedServiceIds).toEqual([5, 6]);
    });

    it('emits NOTHING for a non-root FRAMEWORK duplicate (neither branch applies)', () => {
      fake.servicesData = [
        svcReg({label: 'NgInternalDup', isFramework: true}),
        svcReg({label: 'NgInternalDup', isFramework: true}),
      ];
      const report = svc.runDiagnostics(cfg);
      expect(report.anomalies).withContext('non-root framework dup is silent').toEqual([]);
    });

    it('skips Component-typed duplicates entirely', () => {
      fake.servicesData = [
        svcReg({label: 'MyComponent', dependencyType: 'Component', isRoot: true}),
        svcReg({label: 'MyComponent', dependencyType: 'Component', isRoot: true}),
      ];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('skips Directive-typed duplicates entirely', () => {
      fake.servicesData = [
        svcReg({label: 'MyDirective', dependencyType: 'Directive', isRoot: true}),
        svcReg({label: 'MyDirective', dependencyType: 'Directive', isRoot: true}),
      ];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does not flag a single instance', () => {
      fake.servicesData = [svcReg({label: 'Solo', isRoot: true})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // heavy-state
  // -------------------------------------------------------------------------

  describe('heavy-state check', () => {
    // threshold 5 => warning when size > 5, critical when size > 20.
    const cfg = makeConfig({checkHeavyState: true, thresholdHeavyState: 5});

    it('flags an instance whose estimated size exceeds the threshold as WARNING', () => {
      // size = 1 (object key) + 7 (array length) = 8  -> >5, not >20
      fake.servicesData = [svcReg({id: 3, label: 'BufferSvc', instance: {arr: nums(7)}})];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('heavy-3', report)!;
      expect(a.type).toBe('heavy-state');
      expect(a.severity).toBe('warning');
      expect(a.category).toBe('memory');
    });

    it('escalates to CRITICAL when size exceeds 4x the threshold', () => {
      // size = 1 + 25 = 26 -> >20
      fake.servicesData = [svcReg({id: 4, label: 'HugeSvc', instance: {arr: nums(25)}})];
      expect(anomalyOf('heavy-4', svc.runDiagnostics(cfg))?.severity).toBe('critical');
    });

    it('does not flag an instance at or below the threshold', () => {
      // size = 1 + 3 = 4  (not > 5)
      fake.servicesData = [svcReg({label: 'SmallSvc', instance: {arr: nums(3)}})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('propagates isFramework onto the heavy-state anomaly', () => {
      fake.servicesData = [
        svcReg({id: 9, label: 'NgHeavy', isFramework: true, instance: {arr: nums(7)}}),
      ];
      expect(anomalyOf('heavy-9', svc.runDiagnostics(cfg))?.isFramework).toBeTrue();
    });

    it('skips services with no instance', () => {
      fake.servicesData = [svcReg({label: 'NoInstance', instance: null})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // unused-instance (zombie)
  // -------------------------------------------------------------------------

  describe('unused-instance check', () => {
    const cfg = makeConfig({checkUnused: true});

    it('flags a non-root, never-used Service as a zombie (info)', () => {
      fake.servicesData = [
        svcReg({id: 7, label: 'DeadSvc', isRoot: false, usageCount: 0, dependencyType: 'Service'}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('zombie-7', report)!;
      expect(a.type).toBe('unused-instance');
      expect(a.severity).toBe('info');
      expect(a.category).toBe('best-practice');
      expect(a.title).withContext('non-framework zombie title').toBe('Zombie Provider: DeadSvc');
    });

    it('uses the "Unused Internal" title for framework zombies', () => {
      fake.servicesData = [
        svcReg({id: 8, label: 'NgUnused', isFramework: true, usageCount: 0, dependencyType: 'Token'}),
      ];
      expect(anomalyOf('zombie-8', svc.runDiagnostics(cfg))?.title).toBe('Unused Internal: NgUnused');
    });

    it('accepts every eligible dependency type (Service/Pipe/Token/Signal/Observable)', () => {
      const types: GenieServiceRegistration['dependencyType'][] =
        ['Service', 'Pipe', 'Token', 'Signal', 'Observable'];
      fake.servicesData = types.map((t, i) =>
        svcReg({id: 100 + i, label: `Z${t}`, usageCount: 0, dependencyType: t}));
      const report = svc.runDiagnostics(cfg);
      expect(report.anomalies.length).withContext('all five types are zombies').toBe(5);
      expect(report.anomalies.every(a => a.type === 'unused-instance')).toBeTrue();
    });

    it('does NOT flag root services even when usage is zero', () => {
      fake.servicesData = [svcReg({label: 'RootUnused', isRoot: true, usageCount: 0})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does NOT flag services with usageCount > 0', () => {
      fake.servicesData = [svcReg({label: 'Used', usageCount: 3, isRoot: false})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does NOT flag ineligible dependency types (e.g. Component / Value / System)', () => {
      fake.servicesData = [
        svcReg({label: 'C', usageCount: 0, isRoot: false, dependencyType: 'Component'}),
        svcReg({label: 'V', usageCount: 0, isRoot: false, dependencyType: 'Value'}),
        svcReg({label: 'S', usageCount: 0, isRoot: false, dependencyType: 'System'}),
      ];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // large-api (god object)
  // -------------------------------------------------------------------------

  describe('large-api check', () => {
    // threshold 3 => flag when public property count > 3.
    const cfg = makeConfig({checkLargeApi: true, thresholdLargeApi: 3});

    it('flags a non-framework instance with too many public members as info god-*', () => {
      fake.servicesData = [
        svcReg({id: 2, label: 'GodSvc', instance: {a: 1, b: 2, c: 3, d: 4, e: 5}}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('god-2', report)!;
      expect(a.type).toBe('large-api');
      expect(a.severity).toBe('info');
      expect(a.category).toBe('architecture');
      expect(a.isFramework).toBeFalse();
    });

    it('never flags a framework service even with a huge API', () => {
      fake.servicesData = [
        svcReg({label: 'NgGod', isFramework: true, instance: {a: 1, b: 2, c: 3, d: 4, e: 5}}),
      ];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does not flag an instance at or below the threshold', () => {
      fake.servicesData = [svcReg({label: 'Lean', instance: {a: 1, b: 2, c: 3}})]; // exactly 3, not > 3
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // circular-risk (Injector reference)
  // -------------------------------------------------------------------------

  describe('circular-risk check', () => {
    const cfg = makeConfig({checkCircular: true});

    it('flags a non-framework object instance that holds an Injector reference (warning)', () => {
      fake.servicesData = [
        svcReg({id: 12, label: 'LocatorSvc', instance: {inj: makeInjectorLike(), name: 'x'}}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('injector-12', report)!;
      expect(a.type).toBe('circular-risk');
      expect(a.severity).toBe('warning');
      expect(a.category).toBe('architecture');
    });

    it('does not flag an instance with no Injector reference', () => {
      fake.servicesData = [svcReg({label: 'Clean', instance: {a: 1, b: 2}})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('skips framework services entirely', () => {
      fake.servicesData = [
        svcReg({label: 'NgLocator', isFramework: true, instance: {inj: makeInjectorLike()}}),
      ];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('skips signal instances (isSignal short-circuit)', () => {
      // A signal is a function; even if it "held" an injector, the check is guarded by !isSignal.
      fake.servicesData = [svcReg({label: 'SignalSvc', instance: signal({inj: makeInjectorLike()})})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // high-coupling (per node)
  // -------------------------------------------------------------------------

  describe('high-coupling check', () => {
    // threshold 2 => warning when depCount > 2, critical when depCount > 3 (2 * 1.5).
    const cfg = makeConfig({checkCoupling: true, thresholdCoupling: 2});

    it('flags a node whose dependency count exceeds the threshold as WARNING', () => {
      fake.nodesData = [nodeReg({id: 20, label: 'Widget'})];
      fake.dependenciesData = depsFor(20, 3); // 3 > 2, not > 3
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('coupling-20', report)!;
      expect(a.type).toBe('high-coupling');
      expect(a.severity).toBe('warning');
      expect(a.relatedServiceIds).withContext('no component service registered => empty').toEqual([]);
    });

    it('escalates to CRITICAL past 1.5x the threshold and links the component service', () => {
      fake.servicesData = [svcReg({id: 44, nodeId: 21, label: 'PageComponent', dependencyType: 'Component'})];
      fake.nodesData = [nodeReg({id: 21, label: 'Page'})];
      fake.dependenciesData = depsFor(21, 4); // 4 > 3
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('coupling-21', report)!;
      expect(a.severity).toBe('critical');
      expect(a.relatedServiceIds).withContext('linked to the Component-typed service on the node').toEqual([44]);
    });

    it('does not flag a node at or below the threshold', () => {
      fake.nodesData = [nodeReg({id: 22, label: 'Small'})];
      fake.dependenciesData = depsFor(22, 2); // not > 2
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('treats ng- and _ prefixed node labels as framework and skips them', () => {
      fake.nodesData = [
        nodeReg({id: 30, label: 'ng-container'}),
        nodeReg({id: 31, label: '_GenieComponent'}),
      ];
      fake.dependenciesData = [...depsFor(30, 5), ...depsFor(31, 5)];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // perf-change-detection (per node)
  // -------------------------------------------------------------------------

  describe('perf-change-detection check', () => {
    const cfg = makeConfig({checkChangeDetection: true});

    function cmpInstance(onPush: boolean): any {
      const ctor = class DashboardComponent {};
      (ctor as any)['ɵcmp'] = {onPush};
      return new ctor();
    }

    it('flags a Default-CD component with more than 2 dependencies (info cd-*)', () => {
      fake.servicesData = [svcReg({id: 55, nodeId: 40, label: 'DashboardComponent', dependencyType: 'Component'})];
      fake.nodesData = [nodeReg({id: 40, label: 'Dashboard', componentInstance: cmpInstance(false)})];
      fake.dependenciesData = depsFor(40, 3); // > 2
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('cd-40', report)!;
      expect(a.type).toBe('perf-change-detection');
      expect(a.severity).toBe('info');
      expect(a.category).toBe('performance');
      expect(a.relatedServiceIds).toEqual([55]);
    });

    it('does not flag an OnPush component (ɵcmp.onPush === true)', () => {
      fake.nodesData = [nodeReg({id: 41, label: 'Fast', componentInstance: cmpInstance(true)})];
      fake.dependenciesData = depsFor(41, 5);
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does not flag a Default-CD component with 2 or fewer dependencies', () => {
      fake.nodesData = [nodeReg({id: 42, label: 'Sparse', componentInstance: cmpInstance(false)})];
      fake.dependenciesData = depsFor(42, 2); // not > 2
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('ignores nodes whose label starts with "Anonymous"', () => {
      fake.nodesData = [nodeReg({id: 43, label: 'AnonymousComp', componentInstance: cmpInstance(false)})];
      fake.dependenciesData = depsFor(43, 5);
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('ignores component instances whose constructor has no ɵcmp', () => {
      fake.nodesData = [nodeReg({id: 44, label: 'Plain', componentInstance: {}})];
      fake.dependenciesData = depsFor(44, 5);
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // missing-cleanup (per node)
  // -------------------------------------------------------------------------

  describe('missing-cleanup check', () => {
    const cfg = makeConfig({checkCleanup: true});
    const subscriptionLike = () => ({closed: false, unsubscribe: () => undefined});

    it('flags a component holding a Subscription but no ngOnDestroy (warning)', () => {
      fake.nodesData = [
        nodeReg({id: 50, label: 'FeedComponent', componentInstance: {sub: subscriptionLike()}}),
      ];
      const report = svc.runDiagnostics(cfg);
      const a = anomalyOf('destroy-50', report)!;
      expect(a.type).toBe('missing-cleanup');
      expect(a.severity).toBe('warning');
      expect(a.category).toBe('memory');
    });

    it('does not flag when ngOnDestroy exists on the instance', () => {
      fake.nodesData = [
        nodeReg({
          id: 51,
          label: 'TidyComponent',
          componentInstance: {sub: subscriptionLike(), ngOnDestroy: () => undefined},
        }),
      ];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does not flag when ngOnDestroy lives on the prototype', () => {
      class ProtoTidy {
        sub = subscriptionLike();
        ngOnDestroy(): void {}
      }
      fake.nodesData = [nodeReg({id: 52, label: 'ProtoTidy', componentInstance: new ProtoTidy()})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });

    it('does not flag a component with no subscription-like property', () => {
      fake.nodesData = [nodeReg({id: 53, label: 'StatelessComponent', componentInstance: {value: 1}})];
      expect(svc.runDiagnostics(cfg).anomalies).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // finalizeReport scoring
  // -------------------------------------------------------------------------

  describe('finalizeReport scoring', () => {
    function anomaly(severity: AnomalySeverity, isFramework = false, id = 'x'): Anomaly {
      return {
        id,
        type: 'high-coupling',
        severity,
        title: 't',
        description: 'd',
        relatedServiceIds: [],
        isFramework,
        category: 'architecture',
      };
    }

    function finalize(anomalies: Anomaly[]): DiagnosticsReport {
      return (svc as any).finalizeReport(anomalies);
    }

    it('starts at 100 for no anomalies', () => {
      expect(finalize([]).score).toBe(100);
    });

    it('subtracts 15 / 5 / 1 for non-framework critical / warning / info', () => {
      expect(finalize([anomaly('critical')]).score).withContext('critical -15').toBe(85);
      expect(finalize([anomaly('warning')]).score).withContext('warning -5').toBe(95);
      expect(finalize([anomaly('info')]).score).withContext('info -1').toBe(99);
    });

    it('sums penalties across a mix of severities', () => {
      const score = finalize([
        anomaly('critical', false, 'a'),
        anomaly('warning', false, 'b'),
        anomaly('info', false, 'c'),
      ]).score;
      expect(score).toBe(100 - 15 - 5 - 1); // 79
    });

    it('does NOT reduce the score for framework anomalies', () => {
      const score = finalize([
        anomaly('critical', true, 'a'),
        anomaly('warning', true, 'b'),
        anomaly('info', true, 'c'),
      ]).score;
      expect(score).withContext('framework anomalies are informational only').toBe(100);
    });

    it('clamps the score at 0', () => {
      const many = Array.from({length: 10}, (_u, i) => anomaly('critical', false, `c${i}`)); // -150
      expect(finalize(many).score).toBe(0);
    });

    it('sorts anomalies critical > warning > info regardless of input order', () => {
      const sorted = finalize([
        anomaly('info', false, 'i'),
        anomaly('critical', false, 'c'),
        anomaly('warning', false, 'w'),
      ]).anomalies;
      expect(sorted.map(a => a.severity)).toEqual(['critical', 'warning', 'info']);
    });
  });

  // -------------------------------------------------------------------------
  // helper: estimateSize / estimateInstanceSize
  // -------------------------------------------------------------------------

  describe('estimateSize / estimateInstanceSize helpers', () => {
    const estimateSize = (v: unknown): number => (svc as any).estimateSize(v, 0, new WeakSet());
    const estimateSizeAt = (v: unknown, depth: number): number =>
      (svc as any).estimateSize(v, depth, new WeakSet());
    const estimateInstanceSize = (v: unknown): number => (svc as any).estimateInstanceSize(v);

    it('counts a scalar as 1 (falsy scalars as 0 — characterization)', () => {
      expect(estimateSize(5)).toBe(1);
      expect(estimateSize('hi')).toBe(1);
      expect(estimateSize(0)).withContext('0 is falsy => early return 0').toBe(0);
      expect(estimateSize(null)).toBe(0);
      expect(estimateSize(undefined)).toBe(0);
    });

    it('counts object keys plus each value (nested)', () => {
      // keys=2, each primitive value=1 => 4
      expect(estimateSize({a: 1, b: 2})).toBe(4);
    });

    it('counts array length and samples object elements', () => {
      // primitives: just the length
      expect(estimateSize([1, 2, 3])).toBe(3);
      // objects: length(3) + sampleSize(2) * min(3,10) = 3 + 6 = 9
      expect(estimateSize([{x: 1}, {x: 2}, {x: 3}])).toBe(9);
    });

    it('unwraps signals before measuring', () => {
      expect(estimateSize(signal([1, 2, 3]))).withContext('signal([1,2,3]) => 3').toBe(3);
      expect(estimateSize({s: signal(5)})).withContext('key(1) + unwrapped scalar(1)').toBe(2);
    });

    it('returns 1 when a signal throws on read', () => {
      const boom = computed(() => {
        throw new Error('boom');
      });
      expect(estimateSize(boom)).toBe(1);
    });

    it('caps recursion at depth 3 (depth 4 contributes 0)', () => {
      expect(estimateSizeAt({a: 1}, 4)).toBe(0);
    });

    it('returns 0 for a cycle via the seen set', () => {
      const cyclic: any = {};
      cyclic.self = cyclic;
      // key(1) + self => seen => 0
      expect(estimateSize(cyclic)).toBe(1);
    });

    it('counts a shared reference only once (seen set is shared across the walk)', () => {
      const shared = {v: 1};
      // keys(2) + first shared(2) + second shared(seen=>0) = 4
      expect(estimateSize({p: shared, q: shared})).toBe(4);
    });

    it('counts excluded keys toward length but does not recurse into their values', () => {
      // keys=2 (_hidden + visible). _hidden skipped for recursion; visible adds 1 => 3
      expect(estimateSize({_hidden: [1, 2, 3, 4, 5], visible: 1})).toBe(3);
    });

    it('estimateInstanceSize returns 0 for non-objects', () => {
      expect(estimateInstanceSize(null)).toBe(0);
      expect(estimateInstanceSize(5)).toBe(0);
      expect(estimateInstanceSize('x')).toBe(0);
    });

    it('estimateInstanceSize memoizes per object within a run (stale until caches reset)', () => {
      const inst = {arr: nums(3)};
      expect(estimateInstanceSize(inst)).withContext('1 key + 3 items').toBe(4);
      inst.arr.push(4, 5); // grow the SAME reference
      expect(estimateInstanceSize(inst))
        .withContext('cached — size is frozen until resetVolatileCaches() runs')
        .toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // helper: countPublicProperties
  // -------------------------------------------------------------------------

  describe('countPublicProperties helper', () => {
    const count = (v: unknown): number => (svc as any).countPublicProperties(v);

    it('returns 0 for non-objects', () => {
      expect(count(null)).toBe(0);
      expect(count(5)).toBe(0);
      expect(count('x')).toBe(0);
    });

    it('returns 0 for a signal (characterization: signals are functions)', () => {
      // A signal is a *function*, so countPublicProperties hits its `typeof obj !== 'object'`
      // early-return of 0 BEFORE the `isSignal(obj) => 1` branch — that branch is dead code for
      // real signals. estimateSize, by contrast, checks isSignal first (see helper tests above).
      expect(count(signal(0))).toBe(0);
    });

    it('skips keys starting with _, ng, ɵ or $', () => {
      // public: a, b, e => 3
      expect(count({a: 1, b: 2, e: 3, _c: 4, ngx: 5, ['ɵz']: 6, $d: 7})).toBe(3);
    });

    it('memoizes the count per object (structural cache is not reset)', () => {
      const obj: any = {a: 1, b: 2};
      expect(count(obj)).toBe(2);
      obj.c = 3; // mutate after first count
      expect(count(obj)).withContext('property-count cache is stable, not volatile').toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // helper: hasInjectorReference
  // -------------------------------------------------------------------------

  describe('hasInjectorReference helper', () => {
    const has = (v: object): boolean => (svc as any).hasInjectorReference(v);

    it('detects a property whose value constructor is named "Injector"', () => {
      expect(has({inj: makeInjectorLike(), other: 1})).toBeTrue();
    });

    it('returns false when no property references an Injector', () => {
      expect(has({a: 1, b: {c: 2}})).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // helper: hasSubscriptionProperty
  // -------------------------------------------------------------------------

  describe('hasSubscriptionProperty helper', () => {
    const has = (v: object): boolean => (svc as any).hasSubscriptionProperty(v);

    it('detects a property that has both "closed" and "unsubscribe"', () => {
      expect(has({sub: {closed: false, unsubscribe: () => undefined}})).toBeTrue();
    });

    it('returns false when the property has only one of the two markers', () => {
      expect(has({a: {closed: true}})).withContext('missing unsubscribe').toBeFalse();
      expect(has({b: {unsubscribe: () => undefined}})).withContext('missing closed').toBeFalse();
    });

    it('returns false for an instance with no subscription-like property', () => {
      expect(has({a: 1, b: 'str'})).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // REGRESSION: resetVolatileCaches recreates the volatile caches every run
  // -------------------------------------------------------------------------

  describe('resetVolatileCaches regression', () => {
    it('re-measures instance size on each run (heavy-state appears after the SAME array grows)', () => {
      const cfg = makeConfig({checkHeavyState: true, thresholdHeavyState: 5});
      const instance = {arr: nums(3)}; // size = 1 + 3 = 4  (below threshold)
      fake.servicesData = [svcReg({id: 1, label: 'GrowingSvc', instance})];

      const first = svc.runDiagnostics(cfg);
      expect(anomalyOf('heavy-1', first))
        .withContext('below threshold on the first run')
        .toBeUndefined();

      instance.arr.push(...nums(10)); // same reference now length 13 => size 14 (> 5)

      const second = svc.runDiagnostics(cfg);
      expect(anomalyOf('heavy-1', second)?.severity)
        .withContext('size cache is volatile, so growth is re-measured on the next run')
        .toBe('warning');
    });

    it('re-scans subscription state on each run (missing-cleanup appears after a sub is added)', () => {
      const cfg = makeConfig({checkCleanup: true});
      const instance: any = {value: 1}; // no subscription yet
      fake.nodesData = [nodeReg({id: 60, label: 'LiveComponent', componentInstance: instance})];

      expect(anomalyOf('destroy-60', svc.runDiagnostics(cfg)))
        .withContext('no subscription on the first run')
        .toBeUndefined();

      instance.sub = {closed: false, unsubscribe: () => undefined}; // mutate same instance

      expect(anomalyOf('destroy-60', svc.runDiagnostics(cfg))?.severity)
        .withContext('subscription-state cache is volatile, so the new sub is detected')
        .toBe('warning');
    });
  });

  // -------------------------------------------------------------------------
  // runDiagnosticsChunked
  // -------------------------------------------------------------------------

  describe('runDiagnosticsChunked', () => {
    // A scenario exercising several checks so the produced report is non-trivial.
    function seedRichScenario(): void {
      const widgetCtor = class WidgetComponent {};
      (widgetCtor as any)['ɵcmp'] = {onPush: false};
      const widgetInstance: any = new widgetCtor();
      widgetInstance.sub = {closed: false, unsubscribe: () => undefined};

      fake.servicesData = [
        // duplicate non-root, non-framework, used => dup warning
        svcReg({id: 1, nodeId: 100, label: 'DupSvc', usageCount: 1}),
        svcReg({id: 2, nodeId: 101, label: 'DupSvc', usageCount: 1}),
        // zombie info
        svcReg({id: 3, nodeId: 102, label: 'ZombieSvc', usageCount: 0, isRoot: false, dependencyType: 'Service'}),
        // component service linked to node 20
        svcReg({id: 4, nodeId: 20, label: 'WidgetComponent', dependencyType: 'Component'}),
      ];
      fake.nodesData = [nodeReg({id: 20, label: 'WidgetComponent', componentInstance: widgetInstance})];
      fake.dependenciesData = depsFor(20, 4); // coupling critical + cd (>2)
    }

    const richConfig = makeConfig({
      checkSingleton: true,
      checkUnused: true,
      checkCoupling: true,
      checkChangeDetection: true,
      checkCleanup: true,
      thresholdCoupling: 2,
    });

    it('produces the same report as runDiagnostics when the scheduler runs synchronously', () => {
      seedRichScenario();
      const expected = svc.runDiagnostics(richConfig);
      // Pin the scenario so the equality check is meaningful.
      expect(expected.score).withContext('coupling(-15)+dup(-5)+destroy(-5)+zombie(-1)+cd(-1)').toBe(73);

      // Drive the chunked pipeline fully synchronously.
      spyOn(svc as any, 'scheduleDiagnosticsChunk').and.callFake((cb: () => void) => cb());

      let received: DiagnosticsReport | undefined;
      svc.runDiagnosticsChunked(richConfig, () => undefined, r => (received = r));

      expect(received).toBeDefined();
      expect(received!.score).toBe(expected.score);
      expect(sortById(received!.anomalies))
        .withContext('chunked and single-pass yield the identical anomaly set')
        .toEqual(sortById(expected.anomalies));
    });

    it('advances onProgress through the phases in order and ends on "done"', () => {
      seedRichScenario();
      spyOn(svc as any, 'scheduleDiagnosticsChunk').and.callFake((cb: () => void) => cb());

      const phases: DiagnosticsProgress['phase'][] = [];
      const order: DiagnosticsProgress['phase'][] =
        ['grouping', 'singletons', 'services', 'dependencies', 'nodes', 'done'];
      const idx = (p: DiagnosticsProgress['phase']) => order.indexOf(p);

      const onComplete = jasmine.createSpy('onComplete');
      svc.runDiagnosticsChunked(richConfig, p => phases.push(p.phase), onComplete);

      expect(phases.length).toBeGreaterThan(0);
      expect(phases[0]).withContext('first phase').toBe('grouping');
      expect(phases[phases.length - 1]).withContext('last phase').toBe('done');
      // Phase index never regresses.
      for (let i = 1; i < phases.length; i++) {
        expect(idx(phases[i]))
          .withContext(`phase ${phases[i]} must not precede ${phases[i - 1]}`)
          .toBeGreaterThanOrEqual(idx(phases[i - 1]));
      }
      // Every phase was visited.
      order.forEach(p => expect(phases).withContext(`visited ${p}`).toContain(p));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('cancel() halts the pipeline so onComplete never fires', () => {
      // Empty registry => processGrouping finishes in one chunk and queues processSingletons.
      const queue: Array<() => void> = [];
      spyOn(svc as any, 'scheduleDiagnosticsChunk').and.callFake((cb: () => void) => {
        queue.push(cb);
      });

      const onComplete = jasmine.createSpy('onComplete');
      const onProgress = jasmine.createSpy('onProgress');
      const cancel = svc.runDiagnosticsChunked(makeConfig(), onProgress, onComplete);

      // Run the first queued chunk (grouping), which enqueues the next phase.
      expect(queue.length).toBe(1);
      queue.shift()!();
      expect(queue.length).withContext('grouping scheduled the next phase').toBe(1);

      cancel();

      // Drain whatever remains — each wrapper is a no-op once cancelled.
      while (queue.length) queue.shift()!();

      expect(onComplete).withContext('cancelled before completion').not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalledWith(
        jasmine.objectContaining({phase: 'done'} as Partial<DiagnosticsProgress>)
      );
    });
  });
});
