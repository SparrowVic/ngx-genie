#!/usr/bin/env node
/**
 * Deterministic mock-app generator for the TREE filter integration tests.
 *
 * It emits a large, realistic GenieOS registry snapshot (nodes + service registrations + a few
 * dependency edges) that deliberately exercises EVERY GLOBAL OPS filter dimension:
 *   - nested component tree, several levels deep (parentId links, Environment + Element injectors)
 *   - all 9 dependencyType values (Service/Pipe/Directive/Component/Token/Value/Observable/Signal/System)
 *   - framework (isFramework:true) AND user (isFramework:false) providers of each applicable type
 *   - root (isRoot:true, ɵprov.providedIn:'root') AND local (isRoot:false) providers
 *   - used (usageCount>0) AND unused (usageCount:0) providers
 *   - ISOLATED leaves (no children, no services)          → hideIsolatedComponents
 *   - leaves whose services are ALL unused                → node-level hideUnusedDeps
 *   - ≥2 identical leaf siblings (same label+type, no svc) → groupSimilarSiblings
 *   - nodes with 0,1,few,many services                    → minDeps/maxDeps
 *   - shared service labels across nodes                   → dependencyTags matching
 *   - searchable component labels                          → text search + componentTags
 *
 * The tests DERIVE their expectations from this data via an independent oracle, so regenerating with a
 * new seed (or a bigger tree) never requires touching the assertions.
 *
 * Usage:  node projects/ngx-genie/testing/generate-filter-mock.mjs [seed] [--nodes N]
 * Output: projects/ngx-genie/src/lib/testing/mock-app.generated.ts
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/lib/testing/mock-app.generated.ts');

// ---- deterministic PRNG (mulberry32) ---------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const args = process.argv.slice(2);
const SEED = Number(args.find((a) => /^\d+$/.test(a)) ?? 20260711);
const nodesFlagIdx = args.indexOf('--nodes');
const TARGET_COMPONENT_NODES = nodesFlagIdx >= 0 ? Number(args[nodesFlagIdx + 1]) : 500;

const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));

// ---- vocabularies ----------------------------------------------------------
const USER_TYPES = ['Service', 'Pipe', 'Directive', 'Component', 'Token', 'Value', 'Observable', 'Signal'];
const FRAMEWORK_TYPES = ['Service', 'System', 'Pipe', 'Directive', 'Component', 'Token', 'Observable', 'Signal'];
const PROVIDER_TYPES = ['Class', 'Value', 'Factory', 'Existing', 'Unknown'];

const USER_FEATURE = ['Cart', 'Auth', 'Profile', 'Dashboard', 'Orders', 'Catalog', 'Search', 'Billing',
  'Notifications', 'Settings', 'Analytics', 'Chat', 'Media', 'Inventory', 'Report', 'Workspace'];
const USER_ROLE = {
  Service: ['Service', 'Store', 'Facade', 'Api', 'Repository', 'Manager', 'Gateway'],
  Pipe: ['Pipe'],
  Directive: ['Directive', 'Tooltip', 'Highlight'],
  Component: ['Component', 'Panel', 'Card', 'Widget'],
  Token: ['Token', 'Config', 'Options'],
  Value: ['Value', 'Constant', 'Defaults'],
  Observable: ['Stream', 'Changes$', 'Events$'],
  Signal: ['Signal', 'State', 'Model'],
};
// Framework providers use real-ish Angular names so `isFramework` classification reads naturally.
const FRAMEWORK_NAMES = {
  Service: ['Router', 'HttpClient', 'ActivatedRoute', 'Location', 'Title', 'DomSanitizer', 'Meta'],
  System: ['ElementRef', 'ChangeDetectorRef', 'ViewContainerRef', 'TemplateRef', 'NgZone', 'Renderer2', 'Injector', 'ApplicationRef', 'DestroyRef'],
  Pipe: ['AsyncPipe', 'DatePipe', 'JsonPipe', 'DecimalPipe', 'CurrencyPipe', 'SlicePipe'],
  Directive: ['NgIf', 'NgForOf', 'NgClass', 'NgStyle', 'RouterLink', 'RouterOutlet'],
  Component: ['RouterOutlet', 'NgComponentOutlet'],
  Token: ['DOCUMENT', 'LOCALE_ID', 'PLATFORM_ID', 'APP_ID'],
  Observable: ['Observable', 'Subject', 'BehaviorSubject', 'ReplaySubject'],
  Signal: ['WritableSignal', 'Signal'],
};
const COMPONENT_SUFFIX = ['Page', 'View', 'Panel', 'Section', 'List', 'Item', 'Card', 'Header', 'Footer', 'Nav', 'Layout', 'Container', 'Widget', 'Form', 'Row'];

// ---- state -----------------------------------------------------------------
const nodes = [];
const services = [];
const dependencies = [];
let nextNodeId = 1;
let nextServiceId = 1;

function addNode(label, type, parentId) {
  const id = nextNodeId++;
  nodes.push({id, label, type, parentId, isActive: true});
  return id;
}

function addService(nodeId, {label, dependencyType, isFramework, isRoot, usageCount, providerType}) {
  const id = nextServiceId++;
  services.push({
    id, nodeId, label,
    dependencyType, isFramework, isRoot,
    usageCount,
    providerType: providerType ?? (isRoot ? 'Class' : pick(PROVIDER_TYPES)),
    tokenKind: isRoot ? 'root' : 'local',
  });
  return id;
}

// A pool of shared service labels so `dependencyTags` matching hits multiple nodes.
const SHARED_USER_LABELS = ['CartService', 'AuthService', 'AnalyticsService', 'LoggerService', 'ConfigToken'];
const SHARED_FRAMEWORK_LABELS = ['Router', 'HttpClient', 'ElementRef', 'ChangeDetectorRef'];

function makeUserServiceLabel(type) {
  const feature = pick(USER_FEATURE);
  const role = pick(USER_ROLE[type] ?? ['Service']);
  return `${feature}${role}`;
}

function populateServices(nodeId, count, opts = {}) {
  for (let i = 0; i < count; i++) {
    const isFramework = opts.frameworkOnly ? true : opts.userOnly ? false : chance(0.42);
    let type, label;
    if (isFramework) {
      type = pick(FRAMEWORK_TYPES);
      label = pick(FRAMEWORK_NAMES[type]);
    } else {
      type = pick(USER_TYPES);
      // sprinkle shared labels so dependency-tag AND/OR has multi-node hits
      label = chance(0.18) ? pick(SHARED_USER_LABELS) : makeUserServiceLabel(type);
    }
    if (chance(0.12)) label = pick([...SHARED_USER_LABELS, ...SHARED_FRAMEWORK_LABELS]);
    const isRoot = isFramework ? chance(0.5) : chance(0.25);
    // ~30% unused; force fully-unused batches for some leaves via opts.allUnused
    const usageCount = opts.allUnused ? 0 : chance(0.3) ? 0 : int(1, 12);
    addService(nodeId, {label, dependencyType: type, isFramework, isRoot, usageCount});
  }
}

// ---- build the component tree ----------------------------------------------
const rootId = addNode('_AppRoot', 'Environment', null);
populateServices(rootId, int(6, 12)); // root injector carries a bunch of root singletons

const appId = addNode('AppComponent', 'Element', rootId);
populateServices(appId, int(3, 6));

// Grow the tree from a never-empty pool of expandable parents (appId is always eligible), so we
// reliably reach the node target regardless of the random rolls.
const expandable = [{id: appId, depth: 1}];
while (nodes.length < TARGET_COMPONENT_NODES) {
  // Bias toward shallower/older parents for a broad, realistic tree.
  const parent = expandable[Math.min(Math.floor(Math.pow(rnd(), 1.5) * expandable.length), expandable.length - 1)];
  const depth = parent.depth + 1;
  const label = `${pick(USER_FEATURE)}${pick(COMPONENT_SUFFIX)}Component`;
  const id = addNode(label, 'Element', parent.id);

  const roll = rnd();
  if (roll < 0.16) {
    // ISOLATED leaf: no children, no services (hidden by hideIsolatedComponents)
  } else if (roll < 0.28) {
    // leaf whose services are ALL unused (hidden by node-level hideUnusedDeps)
    populateServices(id, int(1, 3), {allUnused: true});
  } else {
    populateServices(id, int(0, depth < 3 ? 14 : 6));
    if (depth < 6) expandable.push({id, depth});
  }

  // Inject an explicit group of identical leaf siblings under some parents (for groupSimilarSiblings).
  if (chance(0.10)) {
    const dupLabel = `${pick(USER_FEATURE)}IconComponent`;
    const dupCount = int(2, 4);
    for (let d = 0; d < dupCount && nodes.length < TARGET_COMPONENT_NODES; d++) {
      addNode(dupLabel, 'Element', parent.id); // identical label+type, no children, no services
    }
  }
}

// A couple of deep, service-rich branches with well-known labels for search/tag tests.
(() => {
  let pid = appId;
  for (const name of ['SettingsPage', 'SettingsSecurity', 'SettingsSecurityTwoFactor']) {
    const id = addNode(`${name}Component`, 'Element', pid);
    populateServices(id, int(4, 8), {userOnly: true});
    // guarantee some known shared deps on these nodes
    addService(id, {label: 'AuthService', dependencyType: 'Service', isFramework: false, isRoot: false, usageCount: int(1, 5)});
    addService(id, {label: 'ConfigToken', dependencyType: 'Token', isFramework: false, isRoot: false, usageCount: int(1, 5)});
    pid = id;
  }
})();

// ---- a few dependency edges (not read by the tree filter, but realistic for the mock) ----
for (const svc of services) {
  if (svc.usageCount > 0 && chance(0.5)) {
    // pick a random consumer node
    const consumer = nodes[int(0, nodes.length - 1)];
    dependencies.push({consumerNodeId: consumer.id, providerId: svc.id, tokenName: svc.label});
  }
}

// ---- serialize -------------------------------------------------------------
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const nodeLine = (n) =>
  `  { id: ${n.id}, label: ${q(n.label)}, injector: I, type: ${q(n.type)}, parentId: ${n.parentId === null ? 'null' : n.parentId}, isActive: true },`;

const svcLine = (s) =>
  `  { id: ${s.id}, nodeId: ${s.nodeId}, token: ${s.tokenKind === 'root' ? 'ROOT_TOKEN' : 'LOCAL_TOKEN'}, instance: INSTANCE, label: ${q(s.label)}, providerType: ${q(s.providerType)}, usageCount: ${s.usageCount}, isRoot: ${s.isRoot}, isFramework: ${s.isFramework}, dependencyType: ${q(s.dependencyType)}, properties: {} },`;

const depLine = (d) =>
  `  { consumerNodeId: ${d.consumerNodeId}, providerId: ${d.providerId}, tokenName: ${q(d.tokenName)}, type: 'Direct', flags: {}, resolutionPath: [] },`;

const usageUsed = services.filter((s) => s.usageCount > 0).length;
const frameworkCount = services.filter((s) => s.isFramework).length;
const rootCount = services.filter((s) => s.isRoot).length;

const out = `// AUTO-GENERATED — do not edit by hand.
// Regenerate: node projects/ngx-genie/testing/generate-filter-mock.mjs ${SEED}
//
// A large, deterministic mock GenieOS registry snapshot used by the TREE filter integration tests.
// The tests never hard-code counts against this data — an independent oracle derives every expectation
// from these same arrays, so re-running the generator (even with a different seed) keeps the suite green
// as long as the filters behave correctly.
//
// Seed ${SEED} · ${nodes.length} nodes · ${services.length} services · ${dependencies.length} dependency edges
// (${frameworkCount} framework / ${services.length - frameworkCount} user · ${rootCount} root · ${usageUsed} used / ${services.length - usageUsed} unused)
/* eslint-disable */
import {Injector} from '@angular/core';
import {GenieDependency, GenieNode, GenieServiceRegistration} from '../models/genie-node.model';

/** All nodes share one inert injector — the tree filter never dereferences it. */
const I = {} as unknown as Injector;
const ROOT_TOKEN = {ɵprov: {providedIn: 'root'}} as unknown as GenieServiceRegistration['token'];
const LOCAL_TOKEN = {} as unknown as GenieServiceRegistration['token'];
const INSTANCE = {} as unknown as GenieServiceRegistration['instance'];

export const MOCK_SEED = ${SEED};

export const MOCK_NODES: GenieNode[] = [
${nodes.map(nodeLine).join('\n')}
];

export const MOCK_SERVICES: GenieServiceRegistration[] = [
${services.map(svcLine).join('\n')}
];

export const MOCK_DEPENDENCIES: GenieDependency[] = [
${dependencies.map(depLine).join('\n')}
];
`;

mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, out, 'utf8');
console.log(`Wrote ${OUT}`);
console.log(`  seed=${SEED} nodes=${nodes.length} services=${services.length} deps=${dependencies.length}`);
console.log(`  framework=${frameworkCount} user=${services.length - frameworkCount} root=${rootCount} used=${usageUsed} unused=${services.length - usageUsed}`);
