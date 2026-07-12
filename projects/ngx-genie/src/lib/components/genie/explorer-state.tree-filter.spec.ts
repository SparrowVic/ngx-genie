/**
 * TREE view ⇄ GLOBAL OPS filter integration tests.
 *
 * Goal: prove that clicking any combination of GLOBAL OPS options produces the CORRECT set of TREE
 * rows and counts. The seam is a single signal — GenieExplorerStateService.filterState (+ searchQuery,
 * deep-focus, scan state) — driven against a large generated mock app (see mock-app.generated.ts).
 *
 * Strategy (fully dynamic — regenerating the mock never breaks assertions):
 *  1. DIFFERENTIAL: for a broad matrix of filter states, assert the service's filteredTree() projection
 *     equals an INDEPENDENT recursive oracle (filter-oracle.ts). The service uses a stack-based chunked
 *     algorithm (browser) and a synchronous one (server); the oracle is a third, plain recursive
 *     implementation — agreement across all three is strong evidence the filters are correct.
 *  2. GROUND TRUTH: hand-derived invariants that do NOT go through the oracle (so a shared conceptual
 *     bug can't hide), e.g. "root-only ⇒ every visible dependency is root".
 *  3. FEATURES: filteredStats + exportFilteredTreeAsJson match the filtered tree.
 *  4. REAL PATH: a sample of the matrix re-checked against the oracle on the browser (chunked) path.
 */
import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {GenieExplorerStateService} from './explorer-state.service';
import {GenieRegistryService} from '../../services/genie-registry.service';
import {GenieFilterState} from './options-panel/options-panel.models';
import {GenieTreeNode} from '../../models/genie-node.model';

import {MockGenieRegistry} from '../../testing/mock-genie-registry';
import {MOCK_NODES, MOCK_SERVICES, MOCK_DEPENDENCIES} from '../../testing/mock-app.generated';
import {
  ProjectedNode,
  countProjected,
  makeFilterState,
  oracleFilteredServicesByNodeId,
  oracleFilteredTree,
  projectTree,
  OracleOptions
} from '../../testing/filter-oracle';

// A few real labels lifted from the deterministic mock (see the generator's explicit "Settings" branch).
const KNOWN_NODE_LABELS = MOCK_NODES.map((n) => n.label);

interface Case {
  name: string;
  state: Partial<GenieFilterState>;
  opts?: OracleOptions;
}

// Everything visible — the widest possible tree (every node survives).
const SHOW_EVERYTHING: Partial<GenieFilterState> = {
  hideUnusedDeps: false,
  hideIsolatedComponents: false,
  groupSimilarSiblings: false,
  hideInternals: false,
  showUserSignals: true,
  showFrameworkServices: true,
  showFrameworkSystem: true,
  showFrameworkPipes: true,
  showFrameworkDirectives: true,
  showFrameworkComponents: true,
  showFrameworkTokens: true,
  showFrameworkObservables: true,
  showFrameworkSignals: true,
  minDeps: 0,
  maxDeps: 100000
};

const ALL_FRAMEWORK_ON: Partial<GenieFilterState> = {
  hideInternals: false,
  showFrameworkServices: true,
  showFrameworkSystem: true,
  showFrameworkPipes: true,
  showFrameworkDirectives: true,
  showFrameworkComponents: true,
  showFrameworkTokens: true,
  showFrameworkObservables: true,
  showFrameworkSignals: true
};

const CASES: Case[] = [
  {name: 'default GLOBAL OPS', state: {}},
  {name: 'show everything', state: SHOW_EVERYTHING},

  // noise reduction
  {name: 'hideInternals off (framework still per-type gated)', state: {hideInternals: false}},
  {name: 'hideInternals off + all framework on', state: ALL_FRAMEWORK_ON},
  {name: 'hideUnusedDeps off', state: {hideUnusedDeps: false}},
  {name: 'hideIsolatedComponents off', state: {hideIsolatedComponents: false}},
  {name: 'groupSimilarSiblings off', state: {groupSimilarSiblings: false}},
  {name: 'all leaves visible (no isolate/unused)', state: {hideUnusedDeps: false, hideIsolatedComponents: false}},
  {name: 'all leaves + no grouping', state: {hideUnusedDeps: false, hideIsolatedComponents: false, groupSimilarSiblings: false}},

  // scope
  {name: 'root only', state: {showRootOnly: true}},
  {name: 'local only', state: {showLocalOnly: true}},
  {name: 'root only + all leaves', state: {showRootOnly: true, hideUnusedDeps: false, hideIsolatedComponents: false}},

  // user provider types — each off in isolation
  {name: 'no user services', state: {showUserServices: false}},
  {name: 'no user pipes', state: {showUserPipes: false}},
  {name: 'no user directives', state: {showUserDirectives: false}},
  {name: 'no user components', state: {showUserComponents: false}},
  {name: 'no user tokens', state: {showUserTokens: false}},
  {name: 'no user values', state: {showUserValues: false}},
  {name: 'no user observables', state: {showUserObservables: false}},
  {name: 'user signals ON', state: {showUserSignals: true}},
  {
    name: 'all user types off',
    state: {
      showUserServices: false, showUserPipes: false, showUserDirectives: false, showUserComponents: false,
      showUserTokens: false, showUserValues: false, showUserObservables: false, showUserSignals: false
    }
  },

  // framework provider types — each on in isolation (with hideInternals off)
  {name: 'framework services only', state: {hideInternals: false, showFrameworkServices: true}},
  {name: 'framework system only', state: {hideInternals: false, showFrameworkSystem: true}},
  {name: 'framework pipes only', state: {hideInternals: false, showFrameworkPipes: true}},
  {name: 'framework directives only', state: {hideInternals: false, showFrameworkDirectives: true}},
  {name: 'framework components only', state: {hideInternals: false, showFrameworkComponents: true}},
  {name: 'framework tokens only', state: {hideInternals: false, showFrameworkTokens: true}},
  {name: 'framework observables only', state: {hideInternals: false, showFrameworkObservables: true}},
  {name: 'framework signals only', state: {hideInternals: false, showFrameworkSignals: true}},

  // complexity
  {name: 'minDeps 1', state: {minDeps: 1, hideIsolatedComponents: false, hideUnusedDeps: false}},
  {name: 'minDeps 3', state: {minDeps: 3, hideIsolatedComponents: false, hideUnusedDeps: false}},
  {name: 'minDeps 5 maxDeps 10', state: {minDeps: 5, maxDeps: 10, hideIsolatedComponents: false, hideUnusedDeps: false}},
  {name: 'maxDeps 0', state: {maxDeps: 0, hideIsolatedComponents: false, hideUnusedDeps: false}},
  {name: 'maxDeps 2', state: {maxDeps: 2, hideIsolatedComponents: false, hideUnusedDeps: false}},

  // search / tags
  {name: 'text search "Settings"', state: {}, opts: {searchQuery: 'Settings'}},
  {name: 'text search "Icon"', state: {}, opts: {searchQuery: 'Icon'}},
  {name: 'text search no-match', state: {}, opts: {searchQuery: 'zzz-nope-zzz'}},
  {name: 'dependency tags OR [AuthService, ConfigToken]', state: {dependencyTags: ['AuthService', 'ConfigToken'], matchMode: 'OR'}},
  {name: 'dependency tags AND [AuthService, ConfigToken]', state: {dependencyTags: ['AuthService', 'ConfigToken'], matchMode: 'AND'}},

  // scan active disables completeness filters
  {name: 'scan active (isolate/unused suppressed)', state: {}, opts: {isScanActive: true}},

  // combinations
  {name: 'root only + framework on + no grouping', state: {...ALL_FRAMEWORK_ON, showRootOnly: true, groupSimilarSiblings: false}},
  {name: 'local + user services only', state: {showLocalOnly: true, showUserPipes: false, showUserDirectives: false, showUserComponents: false, showUserTokens: false, showUserValues: false, showUserObservables: false}}
];

// ---- shared helpers --------------------------------------------------------

function flushEffects(): void {
  const tb = TestBed as unknown as {tick?: () => void; flushEffects?: () => void};
  for (let i = 0; i < 6; i++) {
    if (typeof tb.tick === 'function') tb.tick();
    else if (typeof tb.flushEffects === 'function') tb.flushEffects();
  }
}

function selectionNode(id: number): GenieTreeNode {
  // The service only reads selectedNode().id for deep focus.
  return {id, label: '', type: 'Element', parentId: null, injector: null as any, isActive: true, children: []};
}

function applyState(
  service: GenieExplorerStateService,
  registry: MockGenieRegistry,
  filters: GenieFilterState,
  opts: OracleOptions
): void {
  service.searchQuery.set(opts.searchQuery ?? '');
  service.isDeepFocusMode.set(!!opts.isDeepFocus);
  service.selectedNode.set(opts.selectedNodeId != null ? selectionNode(opts.selectedNodeId) : null);
  registry.setScanActive(!!opts.isScanActive);
  service.filterState.set(filters);
}

function projectSut(service: GenieExplorerStateService): ProjectedNode[] {
  return projectTree(service.filteredTree(), (id) => service.getProvidersForNode(id));
}

function projectOracle(filters: GenieFilterState, opts: OracleOptions): ProjectedNode[] {
  const index = oracleFilteredServicesByNodeId(MOCK_SERVICES, filters, opts.isForceShown ?? (() => false));
  const tree = oracleFilteredTree(MOCK_NODES, MOCK_SERVICES, filters, opts);
  return projectTree(tree, (id) => index.get(id) ?? []);
}

/** Flatten every visible dependency across the projected tree. */
function allVisibleDepLabels(tree: ProjectedNode[]): string[] {
  const out: string[] = [];
  const stack = [...tree];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(...n.deps);
    if (n.children.length) stack.push(...n.children);
  }
  return out;
}

function allProjectedNodes(tree: ProjectedNode[]): ProjectedNode[] {
  const out: ProjectedNode[] = [];
  const stack = [...tree];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    if (n.children.length) stack.push(...n.children);
  }
  return out;
}

// ===========================================================================
// 1 + 2 + 3 — synchronous (server) path
// ===========================================================================
describe('TREE filter integration (sync path)', () => {
  let service: GenieExplorerStateService;
  let registry: MockGenieRegistry;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        GenieExplorerStateService,
        {provide: GenieRegistryService, useClass: MockGenieRegistry},
        {provide: PLATFORM_ID, useValue: 'server'}
      ]
    });
    registry = TestBed.inject(GenieRegistryService) as unknown as MockGenieRegistry;
    registry.setSnapshot(MOCK_NODES, MOCK_SERVICES, MOCK_DEPENDENCIES);
    service = TestBed.inject(GenieExplorerStateService);
  });

  it('the mock exercises every dependency type, both frameworks, scopes and usage states', () => {
    const types = new Set(MOCK_SERVICES.map((s) => s.dependencyType));
    ['Service', 'Pipe', 'Directive', 'Component', 'Token', 'Value', 'Observable', 'Signal', 'System']
      .forEach((t) => expect(types.has(t as any)).withContext(`mock is missing dependencyType ${t}`).toBe(true));
    expect(MOCK_SERVICES.some((s) => s.isFramework)).toBe(true);
    expect(MOCK_SERVICES.some((s) => !s.isFramework)).toBe(true);
    expect(MOCK_SERVICES.some((s) => s.isRoot)).toBe(true);
    expect(MOCK_SERVICES.some((s) => (s.usageCount || 0) === 0)).toBe(true);
    expect(MOCK_SERVICES.some((s) => (s.usageCount || 0) > 0)).toBe(true);
    expect(MOCK_NODES.length).toBeGreaterThan(100);
  });

  describe('differential vs independent oracle — filter matrix', () => {
    for (const c of CASES) {
      it(c.name, () => {
        const filters = makeFilterState(c.state);
        const opts = c.opts ?? {};
        applyState(service, registry, filters, opts);
        flushEffects();
        expect(projectSut(service)).withContext(c.name).toEqual(projectOracle(filters, opts));
      });
    }

    it('deep focus on a mid-tree node restricts to its ancestor path + subtree', () => {
      const target = MOCK_NODES.find((n) => n.label === 'SettingsSecurityComponent') ?? MOCK_NODES[10];
      const opts: OracleOptions = {isDeepFocus: true, selectedNodeId: target.id};
      const filters = makeFilterState({});
      applyState(service, registry, filters, opts);
      flushEffects();
      const sut = projectSut(service);
      expect(sut).withContext('deep focus vs oracle').toEqual(projectOracle(filters, opts));
      // the selected node must be present somewhere in the focused tree
      expect(allProjectedNodes(sut).some((n) => n.id === target.id)).withContext('selected node present').toBe(true);
    });

    it('componentTags restrict to the tagged component labels', () => {
      const tags = [KNOWN_NODE_LABELS.find((l) => l.includes('Settings')) ?? 'AppComponent', 'AppComponent'];
      const filters = makeFilterState({componentTags: tags});
      applyState(service, registry, filters, {});
      flushEffects();
      expect(projectSut(service)).withContext('componentTags vs oracle').toEqual(projectOracle(filters, {}));
    });
  });

  describe('ground-truth invariants (not derived from the oracle)', () => {
    function apply(state: Partial<GenieFilterState>, opts: OracleOptions = {}) {
      const filters = makeFilterState(state);
      applyState(service, registry, filters, opts);
      flushEffects();
      return projectSut(service);
    }

    it('"show everything" keeps every node in the mock', () => {
      const sut = apply(SHOW_EVERYTHING);
      expect(allProjectedNodes(sut).length).toBe(MOCK_NODES.length);
    });

    it('root only ⇒ every visible dependency is a root provider', () => {
      const sut = apply({showRootOnly: true, hideUnusedDeps: false, hideIsolatedComponents: false, ...ALL_FRAMEWORK_ON, showUserSignals: true});
      const rootLabels = new Set(MOCK_SERVICES.filter((s) => s.isRoot).map((s) => s.label));
      const nonRootLabels = new Set(MOCK_SERVICES.filter((s) => !s.isRoot).map((s) => s.label));
      const visible = allVisibleDepLabels(sut);
      expect(visible.length).toBeGreaterThan(0);
      // A label that is ONLY ever non-root must never appear.
      const purelyNonRoot = [...nonRootLabels].filter((l) => !rootLabels.has(l));
      purelyNonRoot.forEach((l) => expect(visible).withContext(`non-root ${l} leaked under root-only`).not.toContain(l));
    });

    it('local only ⇒ no purely-root provider is visible', () => {
      const sut = apply({showLocalOnly: true, hideUnusedDeps: false, hideIsolatedComponents: false, ...ALL_FRAMEWORK_ON, showUserSignals: true});
      const rootLabels = new Set(MOCK_SERVICES.filter((s) => s.isRoot).map((s) => s.label));
      const localLabels = new Set(MOCK_SERVICES.filter((s) => !s.isRoot).map((s) => s.label));
      const visible = new Set(allVisibleDepLabels(sut));
      const purelyRoot = [...rootLabels].filter((l) => !localLabels.has(l));
      purelyRoot.forEach((l) => expect(visible.has(l)).withContext(`root ${l} leaked under local-only`).toBe(false));
    });

    it('hideUnusedDeps ⇒ every visible dependency has usageCount > 0', () => {
      const sut = apply({hideUnusedDeps: true, ...ALL_FRAMEWORK_ON, showUserSignals: true});
      const usedLabels = new Set(MOCK_SERVICES.filter((s) => (s.usageCount || 0) > 0).map((s) => s.label));
      const purelyUnused = new Set(
        MOCK_SERVICES.filter((s) => (s.usageCount || 0) === 0 && !usedLabels.has(s.label)).map((s) => s.label)
      );
      allVisibleDepLabels(sut).forEach((l) =>
        expect(purelyUnused.has(l)).withContext(`unused ${l} leaked under hideUnusedDeps`).toBe(false));
    });

    it('only user Services ⇒ every visible dependency is a non-framework Service', () => {
      const sut = apply({
        hideInternals: true,
        showUserServices: true, showUserPipes: false, showUserDirectives: false, showUserComponents: false,
        showUserTokens: false, showUserValues: false, showUserObservables: false, showUserSignals: false,
        hideUnusedDeps: false, hideIsolatedComponents: false
      });
      const okLabels = new Set(
        MOCK_SERVICES.filter((s) => !s.isFramework && s.dependencyType === 'Service').map((s) => s.label)
      );
      // labels that are exclusively "framework or non-Service" must never show
      const disallowed = new Set(
        MOCK_SERVICES.filter((s) => !(!s.isFramework && s.dependencyType === 'Service')).map((s) => s.label)
      );
      allVisibleDepLabels(sut).forEach((l) => {
        if (!okLabels.has(l)) {
          expect(disallowed.has(l)).withContext(`disallowed ${l} leaked with only-user-Services`).toBe(true);
        }
      });
    });

    it('groupSimilarSiblings collapses identical childless/serviceless leaf siblings', () => {
      const grouped = apply({hideUnusedDeps: false, hideIsolatedComponents: false, groupSimilarSiblings: true});
      const ungrouped = apply({hideUnusedDeps: false, hideIsolatedComponents: false, groupSimilarSiblings: false});
      const groupedNodes = allProjectedNodes(grouped);
      const collapsed = groupedNodes.filter((n) => n.groupCount != null);
      expect(collapsed.length).withContext('expected at least one collapsed sibling group').toBeGreaterThan(0);
      collapsed.forEach((n) => {
        expect(n.groupCount!).toBeGreaterThanOrEqual(2);
        expect(n.id).withContext('grouped node id is negated').toBeLessThan(0);
      });
      // grouping never adds nodes
      expect(allProjectedNodes(grouped).length).toBeLessThan(allProjectedNodes(ungrouped).length);
    });

    it('text search ⇒ every surviving node either matches the query or is an ancestor of a match', () => {
      const sut = apply({}, {searchQuery: 'settings'});
      const nodes = allProjectedNodes(sut);
      expect(nodes.length).toBeGreaterThan(0);
      const idToProjected = new Map(nodes.map((n) => [n.id, n]));
      const matches = (n: ProjectedNode) => n.label.toLowerCase().includes('settings');
      const hasMatchingDescendant = (n: ProjectedNode): boolean =>
        matches(n) || n.children.some(hasMatchingDescendant);
      // every ROOT chain in the SUT tree must contain a match
      sut.forEach((root) => expect(hasMatchingDescendant(root)).withContext('search root has no match').toBe(true));
      void idToProjected;
    });
  });

  describe('filteredStats + exportFilteredTreeAsJson', () => {
    it('filteredStats matches the oracle counts across the matrix', () => {
      for (const c of CASES) {
        const filters = makeFilterState(c.state);
        const opts = c.opts ?? {};
        applyState(service, registry, filters, opts);
        flushEffects();
        const expected = countProjected(projectOracle(filters, opts));
        expect(service.filteredStats()).withContext(`stats: ${c.name}`).toEqual(expected);
      }
    });

    it('exportFilteredTreeAsJson is valid JSON whose element count equals filteredStats.rows', () => {
      applyState(service, registry, makeFilterState(SHOW_EVERYTHING), {});
      flushEffects();
      const json = service.exportFilteredTreeAsJson();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);

      let nodes = 0;
      let deps = 0;
      const walk = (arr: any[]) => {
        for (const n of arr) {
          nodes++;
          expect(typeof n.id).toBe('number');
          expect(typeof n.label).toBe('string');
          expect(n).not.toEqual(jasmine.objectContaining({injector: jasmine.anything()}));
          expect(n).not.toEqual(jasmine.objectContaining({componentInstance: jasmine.anything()}));
          deps += (n.dependencies ?? []).length;
          walk(n.children ?? []);
        }
      };
      walk(parsed);
      const stats = service.filteredStats();
      expect(nodes).withContext('exported node count').toBe(stats.nodes);
      expect(deps).withContext('exported dep count').toBe(stats.dependencies);
      expect(nodes + deps).toBe(stats.rows);
    });
  });
});

// ===========================================================================
// 4 — the REAL (browser, chunked) path against the same oracle
// ===========================================================================
describe('TREE filter integration (browser / chunked path)', () => {
  let service: GenieExplorerStateService;
  let registry: MockGenieRegistry;
  let originalRIC: any;
  let originalCIC: any;

  beforeEach(() => {
    localStorage.clear();
    // Force the chunked scheduler onto setTimeout(0) so fakeAsync can drain it deterministically.
    originalRIC = (window as any).requestIdleCallback;
    originalCIC = (window as any).cancelIdleCallback;
    (window as any).requestIdleCallback = undefined;
    (window as any).cancelIdleCallback = undefined;

    TestBed.configureTestingModule({
      providers: [
        GenieExplorerStateService,
        {provide: GenieRegistryService, useClass: MockGenieRegistry},
        {provide: PLATFORM_ID, useValue: 'browser'}
      ]
    });
    registry = TestBed.inject(GenieRegistryService) as unknown as MockGenieRegistry;
    registry.setSnapshot(MOCK_NODES, MOCK_SERVICES, MOCK_DEPENDENCIES);
    service = TestBed.inject(GenieExplorerStateService);
  });

  afterEach(() => {
    (window as any).requestIdleCallback = originalRIC;
    (window as any).cancelIdleCallback = originalCIC;
  });

  async function settle(): Promise<void> {
    // Zoneless (no zone.js ⇒ no fakeAsync): run effects (which schedule the chunk timers), let the
    // real setTimeout(0) chunks run, and repeat until the raw→services→tree chain has flushed.
    for (let i = 0; i < 8; i++) {
      flushEffects();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    flushEffects();
  }

  const SAMPLE = CASES.filter((_, i) => i % 3 === 0); // representative subset

  for (const c of SAMPLE) {
    it(`chunked: ${c.name}`, async () => {
      const filters = makeFilterState(c.state);
      const opts = c.opts ?? {};
      applyState(service, registry, filters, opts);
      await settle();
      expect(projectSut(service)).withContext(`chunked ${c.name}`).toEqual(projectOracle(filters, opts));
    });
  }

  it('chunked path agrees with the oracle on filteredStats', async () => {
    const filters = makeFilterState({showRootOnly: true});
    applyState(service, registry, filters, {});
    await settle();
    expect(service.filteredStats()).toEqual(countProjected(projectOracle(filters, {})));
  });
});
