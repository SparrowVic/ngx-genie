#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const CONSTELLATION_DIR = path.join(
  ROOT,
  'projects/ngx-genie/src/lib/components/genie/components/data-views/constellation-view'
);
const DEFAULT_PROFILES = [10000, 25000];

const DEPENDENCY_TYPES = [
  'Service',
  'Token',
  'Value',
  'Observable',
  'Signal',
  'Component',
  'Directive',
  'Pipe',
  'System'
];

const PROVIDER_TYPES = ['Class', 'Factory', 'Value', 'Existing'];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const ConstellationMapper = loadMapper();

  console.log('ngx-genie constellation performance harness');
  console.log(`profiles=${options.profiles.join(',')} layout=${options.layout} repeats=${options.repeats}`);
  console.log('');

  for (const nodeCount of options.profiles) {
    const generated = generateScenario(nodeCount, options);
    const memoryBefore = readMemoryMb();
    const timings = [];
    let lastStats = null;

    for (let run = 0; run < options.repeats; run++) {
      const startedAt = performance.now();
      const data = ConstellationMapper.prepareGraphData(
        generated.tree,
        options.hideInternals ? createHideInternalsFilter() : null,
        generated.dependencies,
        node => generated.servicesByNodeId.get(node.id) || [],
        options.width,
        options.height,
        options.componentTree,
        new Map(),
        options.layout
      );
      timings.push(performance.now() - startedAt);
      lastStats = data.stats;
    }

    const memoryAfter = readMemoryMb();
    const summary = summarizeTimings(timings);
    console.log(formatProfileResult({
      nodeCount,
      serviceCount: generated.services.length,
      dependencyCount: generated.dependencies.length,
      summary,
      stats: lastStats,
      memoryDeltaMb: memoryAfter - memoryBefore
    }));
  }
}

function loadMapper() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngx-genie-constellation-harness-'));
  const files = [
    'constellation.models.ts',
    'constellation.worker.ts',
    'constellation.mapper.ts'
  ];

  for (const file of files) {
    const sourcePath = path.join(CONSTELLATION_DIR, file);
    const outputPath = path.join(tempDir, file.replace(/\.ts$/, '.js'));
    const source = fs.readFileSync(sourcePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: file
    }).outputText;
    fs.writeFileSync(outputPath, output);
  }

  const mapperModule = require(path.join(tempDir, 'constellation.mapper.js'));
  if (!mapperModule.ConstellationMapper) {
    throw new Error('Could not load ConstellationMapper from transpiled source.');
  }
  return mapperModule.ConstellationMapper;
}

function parseArgs(args) {
  const options = {
    profiles: DEFAULT_PROFILES,
    layout: 'organic',
    repeats: 2,
    width: 1920,
    height: 1080,
    servicesPerNode: 2.4,
    dependenciesPerNode: 3.1,
    componentTree: false,
    hideInternals: false,
    seed: 42
  };

  for (const arg of args) {
    const [name, rawValue = 'true'] = arg.replace(/^--/, '').split('=');
    switch (name) {
      case 'profiles':
      case 'nodes':
        options.profiles = rawValue
          .split(',')
          .map(value => Math.max(1, Math.floor(Number(value))))
          .filter(Number.isFinite);
        break;
      case 'layout':
        if (rawValue === 'auto' || rawValue === 'atlas' || rawValue === 'organic') {
          options.layout = rawValue;
        }
        break;
      case 'repeats':
        options.repeats = parseBoundedNumber(rawValue, options.repeats, 1);
        break;
      case 'width':
        options.width = parseBoundedNumber(rawValue, options.width, 1);
        break;
      case 'height':
        options.height = parseBoundedNumber(rawValue, options.height, 1);
        break;
      case 'services-per-node':
        options.servicesPerNode = parseBoundedNumber(rawValue, options.servicesPerNode, 0);
        break;
      case 'dependencies-per-node':
        options.dependenciesPerNode = parseBoundedNumber(rawValue, options.dependenciesPerNode, 0);
        break;
      case 'component-tree':
        options.componentTree = rawValue !== 'false';
        break;
      case 'hide-internals':
        options.hideInternals = rawValue !== 'false';
        break;
      case 'seed':
        options.seed = parseBoundedNumber(rawValue, options.seed, 0);
        break;
    }
  }

  if (options.profiles.length === 0) options.profiles = DEFAULT_PROFILES;
  return options;
}

function parseBoundedNumber(rawValue, fallback, min) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function generateScenario(nodeCount, options) {
  const random = mulberry32(options.seed + nodeCount);
  const nodes = new Array(nodeCount);

  for (let index = 0; index < nodeCount; index++) {
    const id = index + 1;
    nodes[index] = {
      id,
      label: index === 0 ? '_App' : `_Feature${Math.floor(index / 140)}Cmp${id}`,
      injector: null,
      type: index === 0 || index % 17 === 0 ? 'Environment' : 'Element',
      parentId: null,
      isActive: true,
      children: []
    };
  }

  for (let index = 1; index < nodeCount; index++) {
    const parentIndex = pickParentIndex(index, random);
    nodes[index].parentId = nodes[parentIndex].id;
    nodes[parentIndex].children.push(nodes[index]);
  }

  const services = [];
  const servicesByNodeId = new Map();
  let nextServiceId = 1;

  for (const node of nodes) {
    const serviceCount = sampleServiceCount(options.servicesPerNode, random);
    const list = [];
    for (let index = 0; index < serviceCount; index++) {
      const service = createService(nextServiceId++, node.id, index, random);
      services.push(service);
      list.push(service);
    }
    servicesByNodeId.set(node.id, list);
  }

  const dependencyTargetCount = services.length > 0
    ? Math.floor(nodeCount * options.dependenciesPerNode)
    : 0;
  const dependencies = new Array(dependencyTargetCount);
  for (let index = 0; index < dependencyTargetCount; index++) {
    const consumerNodeId = 1 + Math.floor(random() * nodeCount);
    const provider = services[Math.floor(random() * services.length)];
    provider.usageCount++;
    dependencies[index] = {
      consumerNodeId,
      providerId: provider.id,
      tokenName: provider.label,
      propName: `dep${index % 11}`,
      type: 'Direct',
      flags: {},
      resolutionPath: [consumerNodeId, provider.nodeId]
    };
  }

  return {
    tree: [nodes[0]],
    nodes,
    services,
    servicesByNodeId,
    dependencies
  };
}

function pickParentIndex(index, random) {
  if (index < 12) return 0;
  if (random() < 0.72) return Math.max(0, index - 1 - Math.floor(random() * Math.min(index, 18)));
  if (random() < 0.86) return Math.floor(random() * Math.sqrt(index));
  return Math.floor(random() * index);
}

function sampleServiceCount(mean, random) {
  if (mean <= 0) return 0;

  const base = Math.floor(mean);
  let count = base;
  if (random() < mean - base) count++;
  if (random() < 0.11) count += 2 + Math.floor(random() * 4);
  if (random() < 0.018) count += 10 + Math.floor(random() * 28);
  return count;
}

function createService(id, nodeId, localIndex, random) {
  const dependencyType = DEPENDENCY_TYPES[Math.floor(random() * DEPENDENCY_TYPES.length)];
  const isRoot = random() < 0.035;
  return {
    id,
    nodeId,
    token: isRoot ? {'ɵprov': {providedIn: 'root'}} : null,
    instance: null,
    label: `${dependencyType}${Math.floor(id / 7)}_${localIndex}`,
    providerType: PROVIDER_TYPES[Math.floor(random() * PROVIDER_TYPES.length)],
    usageCount: 0,
    properties: {},
    isRoot,
    isFramework: random() < 0.28,
    dependencyType
  };
}

function createHideInternalsFilter() {
  return {
    showFrameworkServices: true,
    showFrameworkSystem: true,
    showFrameworkPipes: true,
    showFrameworkDirectives: true,
    showFrameworkComponents: true,
    showFrameworkTokens: true,
    showFrameworkObservables: true,
    showFrameworkSignals: true,
    showUserServices: true,
    showUserPipes: true,
    showUserDirectives: true,
    showUserComponents: true,
    showUserTokens: true,
    showUserValues: true,
    showUserObservables: true,
    showUserSignals: true,
    hideInternals: true,
    hideUnusedDeps: false,
    showRootOnly: false,
    showLocalOnly: false,
    componentTags: [],
    dependencyTags: [],
    matchMode: 'OR',
    searchMode: 'dependency'
  };
}

function summarizeTimings(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const total = timings.reduce((sum, value) => sum + value, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: total / timings.length
  };
}

function formatProfileResult(result) {
  const stats = result.stats || {};
  return [
    `profile nodes=${formatNumber(result.nodeCount)} services=${formatNumber(result.serviceCount)} deps=${formatNumber(result.dependencyCount)}`,
    `  mapper avg=${formatMs(result.summary.avg)} min=${formatMs(result.summary.min)} max=${formatMs(result.summary.max)} memDelta=${result.memoryDeltaMb.toFixed(1)}MB`,
    `  output renderNodes=${formatNumber(stats.renderedNodes || 0)}/${formatNumber(stats.nodes || 0)} renderLinks=${formatNumber(stats.renderedLinks || 0)}/${formatNumber(stats.links || 0)} aggregateLinks=${formatNumber(stats.aggregateLinks || 0)} layout=${stats.layoutMode || 'unknown'} huge=${!!stats.isHuge}`
  ].join('\n');
}

function readMemoryMb() {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function formatMs(value) {
  return `${value.toFixed(1)}ms`;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

main();
