import {
  Injectable,
  Injector,
  computed,
  signal,
  InjectionToken,
  ApplicationRef,
  ComponentRef,
  Type,
  isSignal,
  ChangeDetectorRef,
  ViewRef,
  effect,
  untracked
} from '@angular/core';
import {isObservable} from 'rxjs';
import {
  GenieNode,
  GenieServiceRegistration,
  GenieProviderType,
  GenieNodeType,
  GenieDependency,
  InjectionFlags,
  GenieDependencyType,
  DependencyType
} from '../models/genie-node.model';
import {ANGULAR_CORE_SYSTEM} from '../configs/angular-internals';
import {GenFilterService} from './filter.service';

const ORIGINAL_INJECTOR_GET = Injector.prototype.get;

const IGNORED_TOKENS = new Set<any>([
  Injector,
  'GenieRegistryService',
  'GenieDiagnosticsService',
  'GenieExplorerStateService',
  'InspectorStateService',
  'GenieFilterService',
  'GENIE_CONFIG',
  'GENIE_NODE'
]);

const GENIE_INTERNAL_COMPONENTS = new Set([
  '_GenieComponent'
]);

const EMPTY_SERVICES: GenieServiceRegistration[] = [];
const EMPTY_DEPENDENCIES: GenieDependency[] = [];
const MAX_SNAPSHOT_KEYS = 200;
const MAX_DEFERRED_EVENTS = 50000;
const SCAN_CHUNK_BUDGET_MS = 8;
const SCAN_CHUNK_MAX_ELEMENTS = 250;
const DEFERRED_EVENT_CHUNK_BUDGET_MS = 6;
const DEFERRED_EVENT_CHUNK_MAX_ITEMS = 1000;
const ENRICHMENT_CHUNK_BUDGET_MS = 6;
const ENRICHMENT_CHUNK_MAX_NODES = 30;

const NATIVE_JS_CONSTRUCTORS = new Set([
  'String', 'Number', 'Boolean', 'Object', 'Array', 'Symbol', 'Function',
  'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'Date',
  'RegExp', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
  'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileList', 'FormData'
]);

const CONTEXT_INDEX = 8;

interface DeferredInjectionEvent {
  injector: Injector;
  token: any;
  instance: any;
  flags: any;
}

interface DomScanQueueItem {
  element: HTMLElement;
  parentNode: GenieNode;
}

interface NodeEnrichmentJob {
  nodeId: number;
  componentType: Type<any>;
}

export type GenieScanPhase = 'idle' | 'scanning' | 'deferred' | 'enriching' | 'settled';

export interface GenieScanStatus {
  phase: GenieScanPhase;
  isActive: boolean;
  message: string;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number;
  nodes: number;
  services: number;
  dependencies: number;
  domProcessed: number;
  domRemaining: number;
  deferredProcessed: number;
  deferredTotal: number;
  enrichmentProcessed: number;
  enrichmentTotal: number;
}

const INITIAL_SCAN_STATUS: GenieScanStatus = {
  phase: 'idle',
  isActive: false,
  message: 'IDLE',
  startedAt: null,
  finishedAt: null,
  durationMs: 0,
  nodes: 0,
  services: 0,
  dependencies: 0,
  domProcessed: 0,
  domRemaining: 0,
  deferredProcessed: 0,
  deferredTotal: 0,
  enrichmentProcessed: 0,
  enrichmentTotal: 0
};

@Injectable()
export class GenieRegistryService {
  private readonly _isOpen = signal(false);
  readonly isOpen = computed(() => this._isOpen());

  private readonly _nodes = signal<GenieNode[]>([]);
  readonly nodes = computed(() => this._nodes());

  private readonly _services = signal<GenieServiceRegistration[]>([]);
  readonly services = computed(() => this._services());

  private readonly _dependencies = signal<GenieDependency[]>([]);
  readonly dependencies = computed(() => this._dependencies());

  private readonly _scanStatus = signal<GenieScanStatus>(INITIAL_SCAN_STATUS);
  readonly scanStatus = computed(() => this._scanStatus());

  private _nextNodeId = 1;
  private _nextServiceId = 1;
  private _hasWarnedAboutProduction = false;
  private _isSpyInstalled = false;


  private _isScanning = false;

  private injectorToNodeMap = new WeakMap<Injector, number>();
  private componentInstanceToNodeMap = new WeakMap<object, number>();
  private instanceToServiceMap = new WeakMap<any, number>();
  private dependencyKeySet = new Set<string>();
  private nodeById = new Map<number, GenieNode>();
  private serviceById = new Map<number, GenieServiceRegistration>();
  private serviceIndexById = new Map<number, number>();

  private _isRegistryBatchActive = false;
  private _pendingNodes: GenieNode[] = [];
  private _pendingServices: GenieServiceRegistration[] = [];
  private _pendingDependencies: GenieDependency[] = [];
  private _pendingServiceUsage = new Map<number, number>();
  private _isChunkedScanActive = false;
  private _chunkedScanCompletionCallbacks: Array<() => void> = [];
  private _deferredEvents: DeferredInjectionEvent[] = [];
  private _deferredTokensByInjector = new WeakMap<Injector, Set<any>>();
  private _nodeEnrichmentQueue: NodeEnrichmentJob[] = [];
  private _queuedNodeEnrichmentIds = new Set<number>();
  private _enrichedNodeIds = new Set<number>();
  private _isEnrichmentScheduled = false;
  private _scanStartedAt: number | null = null;
  private _domScanProcessed = 0;
  private _deferredProcessed = 0;
  private _deferredTotal = 0;
  private _enrichmentProcessed = 0;
  private _enrichmentTotal = 0;

  private readonly _nodesById = computed(() => {
    const index = new Map<number, GenieNode>();
    for (const node of this._nodes()) {
      index.set(node.id, node);
    }
    return index;
  });

  private readonly _servicesById = computed(() => {
    const index = new Map<number, GenieServiceRegistration>();
    for (const service of this._services()) {
      index.set(service.id, service);
    }
    return index;
  });

  private readonly _servicesByNodeId = computed(() => {
    const index = new Map<number, GenieServiceRegistration[]>();
    for (const service of this._services()) {
      const list = index.get(service.nodeId);
      if (list) {
        list.push(service);
      } else {
        index.set(service.nodeId, [service]);
      }
    }
    return index;
  });

  private readonly _dependenciesByConsumerNodeId = computed(() => {
    const index = new Map<number, GenieDependency[]>();
    for (const dependency of this._dependencies()) {
      const list = index.get(dependency.consumerNodeId);
      if (list) {
        list.push(dependency);
      } else {
        index.set(dependency.consumerNodeId, [dependency]);
      }
    }
    return index;
  });

  private readonly _dependenciesByProviderId = computed(() => {
    const index = new Map<number, GenieDependency[]>();
    for (const dependency of this._dependencies()) {
      if (dependency.providerId === null) continue;
      const list = index.get(dependency.providerId);
      if (list) {
        list.push(dependency);
      } else {
        index.set(dependency.providerId, [dependency]);
      }
    }
    return index;
  });

  constructor(
    private appRef: ApplicationRef,
    private filterService: GenFilterService
  ) {
    this.installSpy();

    effect(() => {
      this.filterService.configChanged();
      untracked(() => {
        this.reclassifyServices();
      });
    });
  }

  private reclassifyServices() {
    this._services.update(currentServices => {
      let hasChanges = false;
      const updated = currentServices.map(svc => {
        const newIsFramework = this.isSystemToken(svc.token);
        const newDepType = this.getDependencyType(svc.instance, svc.token);
        if (svc.isFramework !== newIsFramework || svc.dependencyType !== newDepType) {
          hasChanges = true;
          return {
            ...svc,
            isFramework: newIsFramework,
            dependencyType: newDepType
          };
        }
        return svc;
      });
      return hasChanges ? updated : currentServices;
    });
  }

  private installSpy(): void {
    if (this._isSpyInstalled) return;
    this._isSpyInstalled = true;

    const registry = this;

    Injector.prototype.get = function (token: any, notFoundValue?: any, flags?: any): any {
      const result = (ORIGINAL_INJECTOR_GET as any).apply(this, [token, notFoundValue, flags]);


      if (registry._isScanning) return result;

      if (registry.isIgnoredTokenFast(token)) return result;
      try {
        registry.handleInjectionEvent(this, token, result, flags);
      } catch (e) {

      }
      return result;
    };
  }


  private patchInjectorInstance(injector: any): void {
    if (!injector || injector['__genie_patched__']) return;

    const originalGet = injector.get;
    const registry = this;

    injector.get = function (token: any, notFoundValue?: any, flags?: any): any {
      const result = originalGet.apply(this, [token, notFoundValue, flags]);

      if (registry._isScanning) return result;

      if (registry.isIgnoredTokenFast(token)) return result;
      try {

        registry.handleInjectionEvent(this, token, result, flags);
      } catch (e) {
      }
      return result;
    };

    injector['__genie_patched__'] = true;
  }

  handleInjectionEvent(requestingInjector: Injector, token: any, instance: any, flags: any) {
    const consumerId = this.injectorToNodeMap.get(requestingInjector);


    if (!consumerId) {
      this.queueDeferredEvent(requestingInjector, token, instance, flags);
      return;
    }

    this.processInjection(consumerId, token, instance, flags);
  }


  private processInjection(consumerId: number, token: any, instance: any, flags: any) {
    if (this.isIgnoredToken(token)) return;

    let providerId: number | null = null;
    if (instance && (typeof instance === 'object' || typeof instance === 'function')) {
      providerId = this.instanceToServiceMap.get(instance) || null;
      if (!providerId) {
        providerId = this.registerLazySystemProvider(consumerId, token, instance);
      }
    }

    const flagsNum = typeof flags === 'number' ? flags : 0;
    const decodedFlags: InjectionFlags = {
      optional: (flagsNum & 8) !== 0,
      skipSelf: (flagsNum & 4) !== 0,
      self: (flagsNum & 2) !== 0,
      host: (flagsNum & 1) !== 0
    };

    const tokenName = this.describeToken(token);
    this.upsertDependency(consumerId, providerId, tokenName, decodedFlags, 'Direct');
  }

  private registerLazySystemProvider(nodeId: number, token: any, instance: any): number {
    const existingId = this.instanceToServiceMap.get(instance);
    if (existingId) return existingId;

    const id = this._nextServiceId++;
    const label = this.describeToken(token);
    const depType = this.getDependencyType(instance, token);
    const isFramework = this.isSystemToken(token);

    const reg: GenieServiceRegistration = {
      id, nodeId: nodeId, token, instance, label: label,
      dependencyType: depType,
      providerType: this.guessProviderType(token, instance),
      usageCount: 0,
      properties: {},
      isRoot: this.checkIsRoot(token),
      isFramework: isFramework
    };

    this.instanceToServiceMap.set(instance, id);
    this.serviceById.set(id, reg);
    this.addServices([reg]);
    return id;
  }

  scanApplication(): void {
    this.installSpy();
    this.startScanMetrics();
    this.beginRegistryBatch();
    this._isScanning = true;

    try {
      const rootComponents = this.appRef.components;
      rootComponents.forEach(rootRef => {
        this.scanComponentTree(rootRef, null);
      });
    } finally {
      this._isScanning = false;
      this.flushRegistryBatch();
      this.processDeferredEventsChunked(() => this.scheduleNodeEnrichmentProcessing());
    }
  }

  scanApplicationChunked(onComplete?: () => void): void {
    if (onComplete) this._chunkedScanCompletionCallbacks.push(onComplete);
    if (this._isChunkedScanActive) return;

    this.installSpy();
    this.startScanMetrics();
    this.beginRegistryBatch();
    this._isChunkedScanActive = true;

    const queue: DomScanQueueItem[] = [];

    try {
      this._isScanning = true;
      for (const rootRef of this.appRef.components) {
        const rootNode = this.scanComponentRef(rootRef, null);
        const nativeElement = rootRef.location.nativeElement as HTMLElement;
        this.enqueueChildElements(nativeElement, rootNode, queue);
      }
    } catch (error) {
      this.finishChunkedScan();
      throw error;
    } finally {
      this._isScanning = false;
    }

    this.processDomScanQueue(queue);
  }

  private processDeferredEventsChunked(onComplete: () => void): void {
    const events = this._deferredEvents;
    if (events.length === 0) {
      onComplete();
      return;
    }

    const remainingEvents: DeferredInjectionEvent[] = [];
    const remainingTokensByInjector = new WeakMap<Injector, Set<any>>();
    let cursor = 0;
    this._deferredProcessed = 0;
    this._deferredTotal = events.length;
    this.updateScanStatus('deferred', {
      deferredProcessed: this._deferredProcessed,
      deferredTotal: this._deferredTotal
    });

    this._deferredEvents = [];
    this._deferredTokensByInjector = new WeakMap();

    const processChunk = () => {
      const startedAt = this.now();
      let processed = 0;

      this.beginRegistryBatch();
      try {
        while (
          cursor < events.length
          && processed < DEFERRED_EVENT_CHUNK_MAX_ITEMS
          && this.now() - startedAt < DEFERRED_EVENT_CHUNK_BUDGET_MS
        ) {
          const evt = events[cursor];
          cursor++;
          processed++;
          this._deferredProcessed++;

          const consumerId = this.injectorToNodeMap.get(evt.injector);
          if (consumerId) {
            if (this.shouldDeferInjectionUntilEnrichment(evt)) {
              this.keepDeferredEvent(evt, remainingEvents, remainingTokensByInjector);
              continue;
            }
            this.processInjection(consumerId, evt.token, evt.instance, evt.flags);
            continue;
          }

          this.keepDeferredEvent(evt, remainingEvents, remainingTokensByInjector);
        }
      } finally {
        this.flushRegistryBatch();
        this.updateScanStatus('deferred', {
          deferredProcessed: this._deferredProcessed,
          deferredTotal: this._deferredTotal
        });
      }

      if (cursor < events.length) {
        this.scheduleScanChunk(processChunk);
        return;
      }

      this._deferredEvents = remainingEvents;
      this._deferredTokensByInjector = remainingTokensByInjector;
      onComplete();
    };

    this.scheduleScanChunk(processChunk);
  }

  private keepDeferredEvent(
    evt: DeferredInjectionEvent,
    remainingEvents: DeferredInjectionEvent[],
    remainingTokensByInjector: WeakMap<Injector, Set<any>>
  ): void {
    if (remainingEvents.length >= MAX_DEFERRED_EVENTS) return;
    remainingEvents.push(evt);

    let tokens = remainingTokensByInjector.get(evt.injector);
    if (!tokens) {
      tokens = new Set<any>();
      remainingTokensByInjector.set(evt.injector, tokens);
    }
    tokens.add(evt.token);
  }

  private shouldDeferInjectionUntilEnrichment(evt: DeferredInjectionEvent): boolean {
    if (this._nodeEnrichmentQueue.length === 0) return false;
    if (!evt.instance || (typeof evt.instance !== 'object' && typeof evt.instance !== 'function')) return false;
    return !this.instanceToServiceMap.get(evt.instance);
  }

  private queueDeferredEvent(injector: Injector, token: any, instance: any, flags: any): void {
    let tokens = this._deferredTokensByInjector.get(injector);
    if (!tokens) {
      tokens = new Set<any>();
      this._deferredTokensByInjector.set(injector, tokens);
    }

    if (tokens.has(token)) return;
    if (this._deferredEvents.length >= MAX_DEFERRED_EVENTS) return;

    tokens.add(token);
    this._deferredEvents.push({injector, token, instance, flags});
  }

  private scanComponentTree(compRef: ComponentRef<any>, parentNode: GenieNode | null): void {
    const node = this.scanComponentRef(compRef, parentNode);
    const nativeElement = compRef.location.nativeElement as HTMLElement;
    this.scanDomForComponents(nativeElement, node);
  }

  private scanComponentRef(compRef: ComponentRef<any>, parentNode: GenieNode | null): GenieNode {
    const componentType = compRef.componentType;
    const name = componentType.name || 'AnonymousComponent';
    if (this.isGenieInternalComponent(name)) {
      const existing = this.findNodeByComponentInstance(compRef.instance);
      if (existing) return existing;
      if (parentNode) return parentNode;
    }

    const injector = compRef.injector;


    this.patchInjectorInstance(injector);

    let node = this.findNodeByInjector(injector) ?? this.findNodeByComponentInstance(compRef.instance);

    if (!node) {
      node = this.register(name, injector, parentNode, 'Element');
      node.componentInstance = compRef.instance;
      this.bindComponentInstanceToNode(compRef.instance, node);
      this.queueNodeEnrichment(node, componentType);
    } else {
      this.bindInjectorToNode(injector, node);
      if (!node.componentInstance) node.componentInstance = compRef.instance;
      this.bindComponentInstanceToNode(compRef.instance, node);
      this.queueNodeEnrichment(node, componentType);
    }

    return node;
  }

  private scanDomForComponents(element: HTMLElement, parentNode: GenieNode): void {
    // @ts-ignore
    const ng = typeof window !== 'undefined' ? window.ng : null;
    if (!ng || !ng.getComponent || !ng.getInjector) {
      if (!this._hasWarnedAboutProduction) {
        console.warn('[Genie] Debugging utilities (window.ng) are missing. Child component discovery is limited in production builds.');
        this._hasWarnedAboutProduction = true;
      }
      return;
    }
    const children = Array.from(element.children);
    for (const child of children) {
      // @ts-ignore
      const context = ng.getComponent(child);
      if (context) {
        if (context === parentNode.componentInstance) {
          this.scanDomForComponents(child as HTMLElement, parentNode);
          continue;
        }

        // @ts-ignore
        const childInjector = ng.getInjector(child);
        if (childInjector) {
          const componentType = context.constructor as Type<any>;
          const name = componentType.name || 'AnonymousComponent';
          if (this.isGenieInternalComponent(name)) continue;

          this.patchInjectorInstance(childInjector);

          let node = this.findNodeByInjector(childInjector) ?? this.findNodeByComponentInstance(context);
          if (!node) {
            node = this.register(name, childInjector, parentNode, 'Element');
            node.componentInstance = context;
            this.bindComponentInstanceToNode(context, node);
            this.queueNodeEnrichment(node, componentType);
          } else {
            this.bindInjectorToNode(childInjector, node);
            if (!node.componentInstance) node.componentInstance = context;
            this.bindComponentInstanceToNode(context, node);
            this.queueNodeEnrichment(node, componentType);
          }
          this.scanDomForComponents(child as HTMLElement, node);
          continue;
        }
      }
      this.scanDomForComponents(child as HTMLElement, parentNode);
    }
  }

  private processDomScanQueue(queue: DomScanQueueItem[], cursor = 0): void {
    if (cursor >= queue.length) {
      this.finishChunkedScan();
      return;
    }

    this.scheduleScanChunk(() => {
      const startedAt = this.now();
      let processed = 0;
      this._isScanning = true;

      try {
        while (cursor < queue.length && processed < SCAN_CHUNK_MAX_ELEMENTS) {
          const item = queue[cursor];
          cursor++;
          this.scanDomElement(item.element, item.parentNode, queue);
          processed++;
          this._domScanProcessed++;

          if (this.now() - startedAt >= SCAN_CHUNK_BUDGET_MS) {
            break;
          }
        }
      } finally {
        this._isScanning = false;
        this.updateScanStatus('scanning', {
          domProcessed: this._domScanProcessed,
          domRemaining: Math.max(0, queue.length - cursor)
        });
      }

      if (cursor < queue.length) {
        this.processDomScanQueue(queue, cursor);
      } else {
        this.finishChunkedScan();
      }
    });
  }

  private scanDomElement(element: HTMLElement, parentNode: GenieNode, queue: DomScanQueueItem[]): void {
    // @ts-ignore
    const ng = typeof window !== 'undefined' ? window.ng : null;
    if (!ng || !ng.getComponent || !ng.getInjector) {
      if (!this._hasWarnedAboutProduction) {
        console.warn('[Genie] Debugging utilities (window.ng) are missing. Child component discovery is limited in production builds.');
        this._hasWarnedAboutProduction = true;
      }
      return;
    }

    try {
      // @ts-ignore
      const context = ng.getComponent(element);
      if (context) {
        if (context === parentNode.componentInstance) {
          this.enqueueChildElements(element, parentNode, queue);
          return;
        }

        // @ts-ignore
        const childInjector = ng.getInjector(element);
        if (childInjector) {
          const componentType = context.constructor as Type<any>;
          const name = componentType.name || 'AnonymousComponent';
          if (this.isGenieInternalComponent(name)) {
            this.enqueueChildElements(element, parentNode, queue);
            return;
          }

          this.patchInjectorInstance(childInjector);

          let node = this.findNodeByInjector(childInjector) ?? this.findNodeByComponentInstance(context);
          if (!node) {
            node = this.register(name, childInjector, parentNode, 'Element');
            node.componentInstance = context;
            this.bindComponentInstanceToNode(context, node);
            this.queueNodeEnrichment(node, componentType);
          } else {
            this.bindInjectorToNode(childInjector, node);
            if (!node.componentInstance) node.componentInstance = context;
            this.bindComponentInstanceToNode(context, node);
            this.queueNodeEnrichment(node, componentType);
          }

          this.enqueueChildElements(element, node, queue);
          return;
        }
      }
    } catch {
    }

    this.enqueueChildElements(element, parentNode, queue);
  }

  private enqueueChildElements(element: HTMLElement, parentNode: GenieNode, queue: DomScanQueueItem[]): void {
    const children = Array.from(element.children) as HTMLElement[];
    for (const child of children) {
      queue.push({element: child, parentNode});
    }
  }

  private scheduleScanChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(callback, {timeout: 80});
      return;
    }
    setTimeout(callback, 0);
  }

  private finishChunkedScan(): void {
    this._isScanning = false;
    this.flushRegistryBatch();

    this.processDeferredEventsChunked(() => {
      this._isChunkedScanActive = false;
      this.scheduleNodeEnrichmentProcessing();
      this.finishScanIfIdle();

      const callbacks = this._chunkedScanCompletionCallbacks;
      this._chunkedScanCompletionCallbacks = [];
      callbacks.forEach(callback => {
        try {
          callback();
        } catch {
        }
      });
    });
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private startScanMetrics(): void {
    const now = this.now();
    this._scanStartedAt = now;
    this._domScanProcessed = 0;
    this._deferredProcessed = 0;
    this._deferredTotal = 0;
    this._enrichmentProcessed = 0;
    this._enrichmentTotal = 0;
    this.updateScanStatus('scanning', {
      startedAt: now,
      finishedAt: null,
      durationMs: 0,
      domProcessed: 0,
      domRemaining: 0,
      deferredProcessed: 0,
      deferredTotal: 0,
      enrichmentProcessed: 0,
      enrichmentTotal: 0
    });
  }

  private updateScanStatus(phase: GenieScanPhase, patch: Partial<GenieScanStatus> = {}): void {
    const now = this.now();
    const startedAt = patch.startedAt ?? this._scanStatus().startedAt ?? this._scanStartedAt;
    const finishedAt = patch.finishedAt ?? null;
    const durationMs = patch.durationMs ?? (startedAt ? Math.max(0, now - startedAt) : 0);
    const status: GenieScanStatus = {
      ...this._scanStatus(),
      ...patch,
      phase,
      isActive: phase !== 'idle' && phase !== 'settled',
      startedAt,
      finishedAt,
      durationMs,
      nodes: this._nodes().length,
      services: this._services().length,
      dependencies: this._dependencies().length
    };

    this._scanStatus.set({
      ...status,
      message: this.describeScanStatus(status)
    });
  }

  private finishScanIfIdle(): void {
    if (
      this._isChunkedScanActive
      || this._isScanning
      || this._nodeEnrichmentQueue.length > 0
    ) {
      return;
    }

    const now = this.now();
    const startedAt = this._scanStatus().startedAt ?? this._scanStartedAt;
    this.updateScanStatus('settled', {
      finishedAt: now,
      durationMs: startedAt ? Math.max(0, now - startedAt) : 0,
      domRemaining: 0,
      deferredProcessed: this._deferredProcessed,
      deferredTotal: this._deferredTotal,
      enrichmentProcessed: this._enrichmentProcessed,
      enrichmentTotal: this._enrichmentTotal
    });
  }

  private describeScanStatus(status: GenieScanStatus): string {
    if (status.phase === 'idle') return 'IDLE';
    if (status.phase === 'scanning') return `SCAN ${status.domProcessed}/${status.domProcessed + status.domRemaining}`;
    if (status.phase === 'deferred') return `DEPS ${status.deferredProcessed}/${status.deferredTotal}`;
    if (status.phase === 'enriching') return `ENRICH ${status.enrichmentProcessed}/${status.enrichmentTotal}`;
    const seconds = Math.max(0, status.durationMs / 1000);
    return `READY ${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  }

  private queueNodeEnrichment(node: GenieNode, componentType: Type<any>): void {
    if (!node.componentInstance) return;
    if (this._enrichedNodeIds.has(node.id) || this._queuedNodeEnrichmentIds.has(node.id)) return;

    this._queuedNodeEnrichmentIds.add(node.id);
    this._nodeEnrichmentQueue.push({nodeId: node.id, componentType});
    this._enrichmentTotal = Math.max(
      this._enrichmentTotal,
      this._enrichedNodeIds.size + this._nodeEnrichmentQueue.length
    );
    this.updateScanStatus(this._isChunkedScanActive || this._isScanning ? 'scanning' : 'enriching', {
      enrichmentProcessed: this._enrichmentProcessed,
      enrichmentTotal: this._enrichmentTotal
    });
    this.scheduleNodeEnrichmentProcessing();
  }

  private scheduleNodeEnrichmentProcessing(): void {
    if (this._isEnrichmentScheduled) return;
    if (this._nodeEnrichmentQueue.length === 0) {
      this.finishScanIfIdle();
      return;
    }

    this._isEnrichmentScheduled = true;
    this.scheduleScanChunk(() => this.processNodeEnrichmentQueue());
  }

  private processNodeEnrichmentQueue(): void {
    this._isEnrichmentScheduled = false;

    if (this._isChunkedScanActive || this._isScanning) {
      this.scheduleNodeEnrichmentProcessing();
      return;
    }

    const startedAt = this.now();
    let processed = 0;
    const wasScanning = this._isScanning;

    this.beginRegistryBatch();
    this._isScanning = true;
    this.updateScanStatus('enriching', {
      enrichmentProcessed: this._enrichmentProcessed,
      enrichmentTotal: this._enrichmentTotal
    });
    try {
      while (
        this._nodeEnrichmentQueue.length > 0
        && processed < ENRICHMENT_CHUNK_MAX_NODES
        && this.now() - startedAt < ENRICHMENT_CHUNK_BUDGET_MS
      ) {
        const job = this._nodeEnrichmentQueue.shift()!;
        this._queuedNodeEnrichmentIds.delete(job.nodeId);

        if (this._enrichedNodeIds.has(job.nodeId)) continue;

        const node = this.nodeById.get(job.nodeId);
        if (!node || !node.componentInstance) continue;

        this.extractProvidersFromComponent(job.componentType, node);
        this.scanConstructorDependencies(job.componentType, node);
        this.scanInjectedProperties(node);
        this.scanTemplateDependencies(node);
        this._enrichedNodeIds.add(job.nodeId);
        this._enrichmentProcessed = this._enrichedNodeIds.size;
        processed++;
      }
    } finally {
      this._isScanning = wasScanning;
      this.flushRegistryBatch();
      this.updateScanStatus('enriching', {
        enrichmentProcessed: this._enrichmentProcessed,
        enrichmentTotal: this._enrichmentTotal
      });
    }

    if (this._nodeEnrichmentQueue.length > 0) {
      this.scheduleNodeEnrichmentProcessing();
    } else if (this._deferredEvents.length > 0) {
      this.processDeferredEventsChunked(() => this.finishScanIfIdle());
    } else {
      this.finishScanIfIdle();
    }
  }

  private scanInjectedProperties(node: GenieNode): void {
    if (!node.componentInstance) return;
    const instance = node.componentInstance;
    const keys = Object.keys(instance);

    for (const key of keys) {
      if (key.startsWith('__') || key.startsWith('ng') || key.startsWith('ɵ')) continue;
      try {
        const value = instance[key];


        if (value && (typeof value === 'object' || typeof value === 'function')) {
          const providerId = this.instanceToServiceMap.get(value);
          if (providerId) {
            const svc = this.getServiceById(providerId);
            if (svc) {
              this.upsertDependency(node.id, providerId, svc.label, {}, 'Direct', key);
            }
            continue;
          }
        }


        if (value && (typeof value === 'object' || typeof value === 'function') && !Array.isArray(value)) {

          const depType = this.getDependencyType(value, null);
          if (depType !== 'Value' || this.isLikelySystemObject(value)) {

            const token = value.constructor || null;
            if (token && !this.isIgnoredToken(token)) {
              const providerId = this.registerLazySystemProvider(node.id, token, value);
              const tokenName = this.describeToken(token);
              this.upsertDependency(node.id, providerId, tokenName, {}, 'Direct', key);
            }
          }
        }
      } catch (e) {
      }
    }
  }

  private isLikelySystemObject(value: any): boolean {
    if (!value || !value.constructor) return false;
    const name = value.constructor.name;
    return ANGULAR_CORE_SYSTEM.has(name) || name === 'ViewRef';
  }

  private scanTemplateDependencies(node: GenieNode): void {
    if (!node.componentInstance) return;
    let lView: any;
    try {


      const wasScanning = this._isScanning;
      this._isScanning = false;
      const cdr = node.injector.get(ChangeDetectorRef, null);
      this._isScanning = wasScanning;

      if (cdr) {

        const providerId = this.registerLazySystemProvider(node.id, ChangeDetectorRef, cdr);
        this.upsertDependency(node.id, providerId, 'ChangeDetectorRef', {}, 'Direct');

        if ((cdr as any)._lView) lView = (cdr as any)._lView;
      }

    } catch (e) {
    }

    if (!lView) return;
    const context = lView[CONTEXT_INDEX];
    if (context !== node.componentInstance) return;

    for (let i = 0; i < lView.length; i++) {
      const item = lView[i];
      if (item && typeof item === 'object') {
        const ctor = item.constructor;
        if (!ctor) continue;
        if (this.isGenieInternalComponent(ctor.name)) continue;
        if (ctor.ɵpipe) this.registerTemplateDependency(node, item, 'Pipe');
        else if (ctor.ɵcmp && item !== node.componentInstance) this.registerTemplateDependency(node, item, 'Component');
        else if (ctor.ɵdir && item !== node.componentInstance) this.registerTemplateDependency(node, item, 'Directive');
      }
    }
  }

  private registerTemplateDependency(node: GenieNode, instance: any, type: GenieDependencyType): void {
    const token = instance.constructor;
    const providerId = this.registerLazySystemProvider(node.id, token, instance);
    const tokenName = this.describeToken(token);
    this.upsertDependency(node.id, providerId, tokenName, {}, 'Direct');
  }

  private scanConstructorDependencies(componentType: Type<any>, node: GenieNode): void {
    let paramTypes: any[] = [];
    // @ts-ignore
    if (typeof Reflect !== 'undefined' && Reflect.getMetadata) {
      try {
        // @ts-ignore
        paramTypes = Reflect.getMetadata('design:paramtypes', componentType) || [];
      } catch (e) {
      }
    }
    if (paramTypes.length === 0 && (componentType as any).ctorParameters) {
      const ctorParams = (componentType as any).ctorParameters;
      const params = typeof ctorParams === 'function' ? ctorParams() : ctorParams;
      if (Array.isArray(params)) paramTypes = params.map((p: any) => p.type || p);
    }

    if (paramTypes && Array.isArray(paramTypes)) {
      paramTypes.forEach((type: any) => {
        if (!type || this.isIgnoredToken(type)) return;


        const typeName = this.describeToken(type);
        if (ANGULAR_CORE_SYSTEM.has(typeName)) {
          try {
            const wasScanning = this._isScanning;
            this._isScanning = false;
            const instance = node.injector.get(type, null);
            this._isScanning = wasScanning;

            if (instance) {
              const providerId = this.registerLazySystemProvider(node.id, type, instance);
              this.upsertDependency(node.id, providerId, typeName, {}, 'Direct');
            }
          } catch (e) {
          }
        }
      });
    }
  }

  private upsertDependency(consumerId: number, providerId: number | null, tokenName: string, flags: InjectionFlags, type: DependencyType, propName?: string) {
    const key = this.getDependencyKey(consumerId, providerId, tokenName);
    if (this.dependencyKeySet.has(key)) return;

    this.dependencyKeySet.add(key);
    if (providerId) {
      this.incrementServiceUsage(providerId);
    }

    this.addDependency({
      consumerNodeId: consumerId, providerId: providerId, tokenName: tokenName,
      type: type, propName: propName, flags: flags, resolutionPath: []
    });
  }

  private isSystemToken(token: any): boolean {
    const name = this.describeToken(token);
    return this.filterService.isInternal(name);
  }

  private isIgnoredToken(token: any): boolean {
    if (IGNORED_TOKENS.has(token)) return true;
    const name = this.describeToken(token);
    return IGNORED_TOKENS.has(name);
  }

  private isIgnoredTokenFast(token: any): boolean {
    return IGNORED_TOKENS.has(token) || (typeof token === 'string' && IGNORED_TOKENS.has(token));
  }

  private isGenieInternalComponent(name: string): boolean {
    return GENIE_INTERNAL_COMPONENTS.has(name);
  }

  private extractProvidersFromComponent(componentType: Type<any>, node: GenieNode): void {
    const tokensToRegister = new Set<any>();
    const injector = node.injector as any;
    const lView = injector._lView;
    if (lView) {
      const tView = lView[1];
      if (tView && tView.data) {
        for (let i = 0; i < tView.data.length; i++) {
          const item = tView.data[i];
          if (item && typeof item === 'object' && item.token) {
            if (this.isLikelyProviderToken(item.token)) tokensToRegister.add(item.token);
          } else if (typeof item === 'function' || item instanceof InjectionToken) {
            if (this.isLikelyProviderToken(item)) tokensToRegister.add(item);
          }
        }
      }
    } else if (injector.records) {
      injector.records.forEach((value: any, key: any) => {
        if (key && this.isLikelyProviderToken(key)) tokensToRegister.add(key);
      });
    }

    const validServices: { token: any, instance: any }[] = [];
    tokensToRegister.forEach(token => {
      const name = this.describeToken(token);
      if (name && name !== 'Object' && name !== 'Unknown' && name !== '[object Object]') {
        try {

          const instance = injector.get(token, null, {optional: true});
          if (instance) validServices.push({token, instance});
        } catch (e) {
        }
      }
    });
    if (validServices.length > 0) this.registerServices(node, validServices);
  }

  registerServices(node: GenieNode, servicesData: { token: any, instance: any }[]): void {
    if (!servicesData?.length) return;
    const newServices: GenieServiceRegistration[] = [];
    servicesData.forEach(({token, instance}) => {
      if (this.isIgnoredToken(token)) return;
      const existingId = this.instanceToServiceMap.get(instance);
      if (existingId) return;

      const id = this._nextServiceId++;
      const label = this.describeToken(token);
      const isFramework = this.isSystemToken(token);
      const depType = this.getDependencyType(instance, token);
      const providerType = this.guessProviderType(token, instance);

      const reg: GenieServiceRegistration = {
        id, nodeId: node.id, token, instance, label: label,
        dependencyType: depType, providerType: providerType, usageCount: 0,
        properties: this.snapshotProperties(instance),
        isRoot: this.checkIsRoot(token), isFramework: isFramework
      };
      this.instanceToServiceMap.set(instance, id);
      this.serviceById.set(id, reg);
      newServices.push(reg);
    });
    if (newServices.length > 0) {
      this.addServices(newServices);
    }
  }

  private getDependencyType(instance: any, token: any): GenieDependencyType {
    const tokenName = this.describeToken(token);
    const manualOverride = this.filterService.getTypeOverride(tokenName);
    if (manualOverride) return manualOverride;

    if (!instance) return 'Service';
    if (isSignal(instance)) return 'Signal';
    if (isObservable(instance)) return 'Observable';

    const ctor = instance.constructor;
    if (ctor) {
      if (ctor.ɵpipe) return 'Pipe';
      if (ctor.ɵcmp) return 'Component';
      if (ctor.ɵdir) return 'Directive';
    }

    if (token instanceof InjectionToken) return 'Token';
    if (ANGULAR_CORE_SYSTEM.has(tokenName)) return 'System';

    const ctorName = ctor?.name;
    if (NATIVE_JS_CONSTRUCTORS.has(ctorName)) return 'Value';

    return 'Service';
  }

  private checkIsRoot(token: any): boolean {
    return token && token['ɵprov'] && token['ɵprov'].providedIn === 'root';
  }

  private isLikelyProviderToken(token: any): boolean {
    if (!token) return false;
    if (typeof token === 'string' || typeof token === 'number' || typeof token === 'boolean') return false;
    if (this.isIgnoredToken(token)) return false;
    const name = this.describeToken(token);
    if (name.startsWith('ɵ')) return false;
    if (name.startsWith('_')) return true;
    if (['ChangeDetector', 'Injector', 'ViewRef', 'ElementRef', 'TemplateRef', 'ViewContainerRef', 'Object', 'Unknown'].some(s => name.includes(s))) return false;
    if (name.startsWith('Ng')) return false;
    if (name.includes('i0')) return false;
    if (typeof token === 'function') return true;
    if (token instanceof InjectionToken) return true;
    return false;
  }

  register(label: string, injector: Injector, parent: GenieNode | null, type: GenieNodeType = 'Environment'): GenieNode {
    const injectorName = injector.constructor.name;
    let nodeType = type;
    if (injectorName === 'NodeInjector') nodeType = 'Element';
    if (injectorName === 'R3Injector') nodeType = 'Environment';

    const node: GenieNode = {
      id: this._nextNodeId++,
      label,
      injector,
      type: nodeType,
      parentId: parent?.id ?? null,
      isActive: true
    };

    try {
      const viewRef = injector.get(ChangeDetectorRef, null) as ViewRef;
      if (viewRef && (viewRef as any).onDestroy) {
        (viewRef as any).onDestroy(() => {
          this.cleanupNode(node.id);
        });
      }
    } catch (e) {
    }
    this.nodeById.set(node.id, node);
    this.addNode(node);
    this.bindInjectorToNode(injector, node);
    return node;
  }

  private cleanupNode(nodeId: number): void {
    const node = this.getNodeById(nodeId);
    const servicesToRemove = this.getServicesForNode(nodeId);
    const serviceIdsToRemove = new Set(servicesToRemove.map(s => s.id));
    if (node) {
      this.injectorToNodeMap.delete(node.injector);
      this.nodeById.delete(node.id);
    }
    if (node?.componentInstance && typeof node.componentInstance === 'object') {
      this.componentInstanceToNodeMap.delete(node.componentInstance);
    }
    for (const service of servicesToRemove) {
      if (service.instance && (typeof service.instance === 'object' || typeof service.instance === 'function')) {
        this.instanceToServiceMap.delete(service.instance);
      }
      this.serviceById.delete(service.id);
    }
    this._nodes.update(nodes => nodes.filter(n => n.id !== nodeId));
    const nextServices = this._services().filter(s => s.nodeId !== nodeId);
    this.rebuildServiceIndex(nextServices);
    this._services.set(nextServices);
    const nextDependencies = this._dependencies().filter(d => d.consumerNodeId !== nodeId && (d.providerId === null || !serviceIdsToRemove.has(d.providerId)));
    this.rebuildDependencyKeys(nextDependencies);
    this._dependencies.set(nextDependencies);
  }

  guessProviderType(token: any, instance: any): GenieProviderType {
    const type = typeof instance;
    if (type === 'string' || type === 'number' || type === 'boolean') return 'Value';
    if (token && (token as any).ɵprov) {
      const prov = (token as any).ɵprov;
      if (prov.useValue !== undefined) return 'Value';
      if (prov.useFactory !== undefined) return 'Factory';
      if (prov.useExisting !== undefined) return 'Existing';
      if (prov.useClass !== undefined) return 'Class';
    }
    const tokenName = this.describeToken(token);
    const instanceName = instance?.constructor?.name;
    if (instanceName && tokenName === instanceName) return 'Class';
    if (token instanceof InjectionToken) return 'Value';
    if (typeof token === 'function' && instanceName && tokenName !== instanceName) return 'Existing';
    return 'Factory';
  }

  snapshotProperties(instance: any): Record<string, any> {
    if (!instance || typeof instance !== 'object') return {};
    const snapshot: Record<string, any> = {};
    let scannedKeys = 0;
    for (const key in instance) {
      scannedKeys++;
      if (scannedKeys > MAX_SNAPSHOT_KEYS) {
        snapshot['...'] = `[truncated after ${MAX_SNAPSHOT_KEYS} keys]`;
        break;
      }
      if (key.startsWith('_') || key.startsWith('ng') || key.startsWith('ɵ')) continue;
      try {
        const val = instance[key];
        if (isSignal(val)) {
          snapshot[key] = '[Signal]';
          continue;
        }
        if (val && typeof val.subscribe === 'function') {
          snapshot[key] = `[Observable]`;
          continue;
        }
        const type = typeof val;
        if (type === 'string' || type === 'number' || type === 'boolean') snapshot[key] = val;
        else if (val === null) snapshot[key] = 'null';
        else if (val === undefined) snapshot[key] = 'undefined';
        else if (Array.isArray(val)) snapshot[key] = `Array(${val.length})`;
        else if (type === 'object') snapshot[key] = val.constructor && val.constructor.name !== 'Object' ? `[${val.constructor.name}]` : '{...}';
      } catch (e) {
      }
    }
    return snapshot;
  }

  getServicesForNode(nodeId: number): GenieServiceRegistration[] {
    return this._servicesByNodeId().get(nodeId) ?? EMPTY_SERVICES;
  }

  getDependenciesForNode(nodeId: number): GenieDependency[] {
    return this._dependenciesByConsumerNodeId().get(nodeId) ?? EMPTY_DEPENDENCIES;
  }

  getDependenciesForService(serviceId: number): GenieDependency[] {
    return this._dependenciesByProviderId().get(serviceId) ?? EMPTY_DEPENDENCIES;
  }

  getServiceById(serviceId: number): GenieServiceRegistration | null {
    return this.serviceById.get(serviceId) ?? null;
  }

  getNodeById(nodeId: number): GenieNode | null {
    return this.nodeById.get(nodeId) ?? null;
  }

  hasPendingDeferredEvents(): boolean {
    return this._deferredEvents.length > 0;
  }

  incrementServiceUsage(serviceId: number): void {
    const pendingIndex = this._pendingServices.findIndex(service => service.id === serviceId);
    if (pendingIndex !== -1) {
      const updated = {
        ...this._pendingServices[pendingIndex],
        usageCount: this._pendingServices[pendingIndex].usageCount + 1
      };
      this._pendingServices[pendingIndex] = updated;
      this.serviceById.set(serviceId, updated);
      return;
    }

    if (this._isRegistryBatchActive) {
      this._pendingServiceUsage.set(serviceId, (this._pendingServiceUsage.get(serviceId) ?? 0) + 1);
      const service = this.serviceById.get(serviceId);
      if (service) {
        this.serviceById.set(serviceId, {...service, usageCount: service.usageCount + 1});
      }
      return;
    }

    this._services.update(list => {
      let index = this.serviceIndexById.get(serviceId) ?? -1;
      if (index === -1 || list[index]?.id !== serviceId) {
        index = list.findIndex(s => s.id === serviceId);
        if (index === -1) {
          this.serviceIndexById.delete(serviceId);
          return list;
        }
        this.serviceIndexById.set(serviceId, index);
      }
      if (index === -1) return list;
      const updated = list.slice();
      updated[index] = {...updated[index], usageCount: updated[index].usageCount + 1};
      this.serviceById.set(serviceId, updated[index]);
      return updated;
    });
  }

  toggle(): void {
    this._isOpen.update(v => !v);
  }

  reset(): void {
    this._nodes.set([]);
    this._services.set([]);
    this._dependencies.set([]);
    this._nextNodeId = 1;
    this._nextServiceId = 1;
    this._hasWarnedAboutProduction = false;
    this.injectorToNodeMap = new WeakMap();
    this.componentInstanceToNodeMap = new WeakMap();
    this.instanceToServiceMap = new WeakMap();
    this.nodeById.clear();
    this.serviceById.clear();
    this.dependencyKeySet.clear();
    this.serviceIndexById.clear();
    this._pendingNodes = [];
    this._pendingServices = [];
    this._pendingDependencies = [];
    this._pendingServiceUsage.clear();
    this._isRegistryBatchActive = false;
    this._deferredEvents = [];
    this._deferredTokensByInjector = new WeakMap();
    this._nodeEnrichmentQueue = [];
    this._queuedNodeEnrichmentIds.clear();
    this._enrichedNodeIds.clear();
    this._isEnrichmentScheduled = false;
    this._scanStartedAt = null;
    this._domScanProcessed = 0;
    this._deferredProcessed = 0;
    this._deferredTotal = 0;
    this._enrichmentProcessed = 0;
    this._enrichmentTotal = 0;
    this._scanStatus.set(INITIAL_SCAN_STATUS);
  }

  findNodeByInjector(injector: Injector): GenieNode | null {
    const nodeId = this.injectorToNodeMap.get(injector);
    return nodeId ? this.getNodeById(nodeId) : null;
  }

  private findNodeByComponentInstance(instance: any): GenieNode | null {
    if (!instance || typeof instance !== 'object') return null;
    const nodeId = this.componentInstanceToNodeMap.get(instance);
    return nodeId ? this.getNodeById(nodeId) : null;
  }

  private bindInjectorToNode(injector: Injector, node: GenieNode): void {
    this.injectorToNodeMap.set(injector, node.id);
  }

  private bindComponentInstanceToNode(instance: any, node: GenieNode): void {
    if (!instance || typeof instance !== 'object') return;
    this.componentInstanceToNodeMap.set(instance, node.id);
  }

  private beginRegistryBatch(): void {
    this._pendingNodes = [];
    this._pendingServices = [];
    this._pendingDependencies = [];
    this._pendingServiceUsage.clear();
    this._isRegistryBatchActive = true;
  }

  private flushRegistryBatch(): void {
    this._isRegistryBatchActive = false;

    if (this._pendingNodes.length > 0) {
      this._nodes.update(nodes => [...nodes, ...this._pendingNodes]);
      this._pendingNodes = [];
    }

    if (this._pendingServices.length > 0 || this._pendingServiceUsage.size > 0) {
      let nextServices = this._pendingServices.length > 0
        ? [...this._services(), ...this._pendingServices]
        : this._services();

      if (this._pendingServiceUsage.size > 0) {
        nextServices = nextServices.map(service => {
          const usageDelta = this._pendingServiceUsage.get(service.id);
          if (!usageDelta) return service;
          const updated = {...service, usageCount: service.usageCount + usageDelta};
          this.serviceById.set(service.id, updated);
          return updated;
        });
        this._pendingServiceUsage.clear();
      }

      this.rebuildServiceIndex(nextServices);
      this._services.set(nextServices);
      this._pendingServices = [];
    }

    if (this._pendingDependencies.length > 0) {
      this._dependencies.update(dependencies => [...dependencies, ...this._pendingDependencies]);
      this._pendingDependencies = [];
    }
  }

  private addNode(node: GenieNode): void {
    if (this._isRegistryBatchActive) {
      this._pendingNodes.push(node);
      return;
    }
    this._nodes.update(nodes => [...nodes, node]);
  }

  private addServices(services: GenieServiceRegistration[]): void {
    if (this._isRegistryBatchActive) {
      this._pendingServices.push(...services);
      return;
    }

    const nextServices = [...this._services(), ...services];
    this.rebuildServiceIndex(nextServices);
    this._services.set(nextServices);
  }

  private addDependency(dependency: GenieDependency): void {
    if (this._isRegistryBatchActive) {
      this._pendingDependencies.push(dependency);
      return;
    }
    this._dependencies.update(dependencies => [...dependencies, dependency]);
  }

  private getDependencyKey(consumerId: number, providerId: number | null, tokenName: string): string {
    return `${consumerId}|${providerId ?? 'null'}|${tokenName}`;
  }

  private rebuildDependencyKeys(dependencies: GenieDependency[]): void {
    this.dependencyKeySet.clear();
    for (const dependency of dependencies) {
      this.dependencyKeySet.add(this.getDependencyKey(
        dependency.consumerNodeId,
        dependency.providerId,
        dependency.tokenName
      ));
    }
  }

  private rebuildServiceIndex(services: GenieServiceRegistration[]): void {
    this.serviceIndexById.clear();
    services.forEach((service, index) => {
      this.serviceIndexById.set(service.id, index);
    });
  }

  private describeToken(token: unknown): string {
    if (!token) return 'Unknown';
    if (token instanceof InjectionToken) return token.toString().replace('InjectionToken ', '');
    if (typeof token === 'function' && (token as any).name) return (token as any).name;
    if (typeof token === 'string') return token;
    if (typeof token === 'object') {
      if ((token as any).name) return (token as any).name;
      if ((token as any).constructor?.name && (token as any).constructor.name !== 'Object') return (token as any).constructor.name;
    }
    return 'Unknown';
  }
}
