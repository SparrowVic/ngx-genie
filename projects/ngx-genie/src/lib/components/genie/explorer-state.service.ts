import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  DestroyRef,
  PLATFORM_ID,
  isSignal,
  untracked,
  NgZone
} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {GenieRegistryService} from '../../services/genie-registry.service';
import {GeniePerformanceService} from '../../services/genie-performance.service';
import {GenFilterService} from '../../services/filter.service';
import {GenieDependency, GenieNode, GenieServiceRegistration, GenieTreeNode} from '../../models/genie-node.model';
import {GenieFilterState} from './options-panel/options-panel.models';

export type GenieViewType = 'tree' | 'org' | 'matrix' | 'constellation' | 'diagnostics';

const STORAGE_KEY_LIVE_WATCH = 'genie_live_watch_enabled';
const TREE_REBUILD_CHUNK_BUDGET_MS = 8;
const FILTERED_SERVICES_CHUNK_BUDGET_MS = 8;
const FILTER_REBUILD_CHUNK_BUDGET_MS = 8;
const EXPAND_ALL_CHUNK_BUDGET_MS = 8;

interface FilterTreeParams {
  root: GenieTreeNode[];
  filters: GenieFilterState;
  query: string;
  isDeepFocus: boolean;
  isScanActive: boolean;
  selectedNode: GenieTreeNode | null;
  servicesByNodeId: Map<number, GenieServiceRegistration[]>;
}

interface FilterTreePreparedParams extends FilterTreeParams {
  pathIds: Set<number>;
  normalizedQuery: string;
  hasTextSearch: boolean;
  componentTags: Set<string>;
  dependencyTags: Set<string>;
  hasCompTags: boolean;
  hasDepTags: boolean;
  hasActiveSearchOrFilter: boolean;
}

interface FilterTreeFrame {
  node: GenieTreeNode | null;
  children: GenieTreeNode[];
  childIndex: number;
  filteredChildren: GenieTreeNode[];
  forceInclude: boolean;
  matchesSelf: boolean;
}

interface RawTreeBuildState {
  sourceNodes: GenieNode[];
  byId: Map<number, GenieTreeNode>;
  roots: GenieTreeNode[];
  phase: 'clone' | 'link';
  cursor: number;
}

interface FilteredServicesIndexResult {
  index: Map<number, GenieServiceRegistration[]>;
  maxDeps: number;
}

@Injectable()
export class GenieExplorerStateService {
  private readonly registry = inject(GenieRegistryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly performance = inject(GeniePerformanceService);
  private readonly filterService = inject(GenFilterService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private liveTimer: any = null;
  private rawTreeRunId = 0;
  private rawTreeTimer: ReturnType<typeof setTimeout> | null = null;
  private rawTreeIdleHandle: number | null = null;
  private filteredServicesRunId = 0;
  private filteredServicesTimer: ReturnType<typeof setTimeout> | null = null;
  private filteredServicesIdleHandle: number | null = null;
  private filterTreeRunId = 0;
  private filterTreeTimer: ReturnType<typeof setTimeout> | null = null;
  private filterTreeIdleHandle: number | null = null;
  private expandAllRunId = 0;
  private expandAllTimer: ReturnType<typeof setTimeout> | null = null;
  private expandAllIdleHandle: number | null = null;
  private isDestroyed = false;
  private serviceConsumerNamesCacheSource: readonly GenieDependency[] | null = null;
  private readonly serviceConsumerNamesCache = new Map<number, string[]>();

  readonly nodes = computed(() => this.registry.nodes());
  readonly services = computed(() => this.registry.services());
  readonly dependencies = computed(() => this.registry.dependencies());
  readonly stats = computed(() => ({nodes: this.nodes().length, services: this.services().length}));
  readonly scanStatus = computed(() => this.registry.scanStatus());
  private readonly isScanActive = computed(() => this.registry.scanStatus().isActive);

  private readonly rawTreeCache = signal<GenieTreeNode[]>([]);
  private readonly treeNodeByIdCache = signal<Map<number, GenieTreeNode>>(new Map());
  private readonly filteredServicesByNodeIdCache = signal<Map<number, GenieServiceRegistration[]>>(new Map());
  private readonly maxFilteredServicesByNodeCache = signal(0);
  private readonly rawTree = computed<GenieTreeNode[]>(() => this.rawTreeCache());
  private readonly treeNodeById = computed(() => this.treeNodeByIdCache());
  private readonly filteredServicesByNodeId = computed(() => this.filteredServicesByNodeIdCache());


  readonly uniqueComponentNames = computed(() => {
    const nodes = this.nodes();
    const names = new Set<string>();
    nodes.forEach(n => names.add(n.label));
    return Array.from(names).sort();
  });

  readonly uniqueDependencyNames = computed(() => {
    const services = this.services();
    const names = new Set<string>();
    services.forEach(s => names.add(s.label));
    return Array.from(names).sort();
  });

  readonly activeView = signal<GenieViewType>('tree');

  readonly selectedNode = signal<GenieTreeNode | null>(null);
  readonly selectedService = signal<GenieServiceRegistration | null>(null);

  readonly searchQuery = signal<string>('');
  readonly isLiveWatch = signal<boolean>(this._loadLiveWatchState());
  readonly isDeepFocusMode = signal<boolean>(false);
  readonly refreshTrigger = signal<number>(0);
  private readonly filteredTreeCache = signal<GenieTreeNode[]>([]);

  private readonly _treeUpdatesSuspended = signal(false);
  private _sawScanSinceSuspend = false;

  readonly filterState = signal<GenieFilterState>({
    hideUnusedDeps: true,
    hideIsolatedComponents: true,
    hideInternals: true,
    groupSimilarSiblings: true,
    showRootOnly: false,
    showLocalOnly: false,

    showUserServices: true,
    showUserPipes: true,
    showUserDirectives: true,
    showUserComponents: true,
    showUserTokens: true,
    showUserValues: true,
    showUserObservables: true,
    showUserSignals: false,

    showFrameworkServices: false,
    showFrameworkSystem: false,
    showFrameworkPipes: false,
    showFrameworkDirectives: false,
    showFrameworkComponents: false,
    showFrameworkTokens: false,
    showFrameworkObservables: false,
    showFrameworkSignals: false,

    minDeps: 0,
    maxDeps: 100,
    searchTags: [],
    componentTags: [],
    dependencyTags: [],
    searchMode: 'component',
    matchMode: 'OR'
  });

  readonly expandedIds = signal<Set<number>>(new Set<number>());

  constructor() {
    effect(() => {
      const svc = this.selectedService();
      if (!svc || !svc.instance) {
        this._snapshotCache.set({error: 'No instance available'});
        return;
      }
      this._snapshotCache.set(this._safeScan(svc.instance));
    });

    effect(() => {
      this.refreshTrigger();
      if (!this.isLiveWatch()) return;
      const svc = this.selectedService();
      if (!svc || !svc.instance) return;
      this._snapshotCache.set(this._safeScan(svc.instance));
    });

    effect(() => {
      if (this.isLiveWatch()) {
        if (this.liveTimer) clearInterval(this.liveTimer);
        this.zone.runOutsideAngular(() => {
          this.liveTimer = setInterval(() => {
            this.zone.run(() => this.refreshTrigger.update(v => v + 1));
          }, 500);
        });
      } else {
        if (this.liveTimer) {
          clearInterval(this.liveTimer);
          this.liveTimer = null;
        }
      }
    });

    effect(() => {
      const isLive = this.isLiveWatch();
      this._saveLiveWatchState(isLive);
    });

    effect(() => {
      this._scheduleRawTreeRebuild(this.nodes());
    });

    effect(() => {
      const services = this.services();
      const filters = this.filterState();
      if (this._treeUpdatesSuspended()) return;
      this._scheduleFilteredServicesRebuild(services, filters);
    });

    effect(() => {
      const params = {
        root: this.rawTree(),
        filters: this.filterState(),
        query: this.searchQuery(),
        isDeepFocus: this.isDeepFocusMode(),
        isScanActive: this.isScanActive(),
        selectedNode: this.selectedNode(),
        servicesByNodeId: this.filteredServicesByNodeId()
      };
      // While a live route re-scan is in flight, freeze the tree at its last settled state so it
      // updates once (old route → new route) instead of flickering through the transient states.
      if (this._treeUpdatesSuspended()) return;
      this._scheduleFilteredTreeRebuild(params);
    });

    // Auto-release the frozen tree once the live re-scan we suspended for has actually settled.
    effect(() => {
      const scanning = this.isScanActive();
      if (!untracked(() => this._treeUpdatesSuspended())) return;
      if (scanning) {
        this._sawScanSinceSuspend = true;
      } else if (this._sawScanSinceSuspend) {
        this._sawScanSinceSuspend = false;
        this.resumeTreeUpdates();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      if (this.liveTimer) clearInterval(this.liveTimer);
      this._cancelScheduledRawTreeRebuild();
      this._cancelScheduledFilteredServicesRebuild();
      this._cancelScheduledFilterTreeRebuild();
      this._cancelScheduledExpandAll();
    });
  }

  readonly filteredTree = computed<GenieTreeNode[]>(() => {
    return this.filteredTreeCache();
  });

  readonly inspectorServices = computed(() => {
    const node = this.selectedNode();
    return node ? this.registry.getServicesForNode(node.id) : [];
  });

  readonly inspectorDependencies = computed(() => {
    const node = this.selectedNode();
    return node ? this.registry.getDependenciesForNode(node.id) : [];
  });

  readonly inspectorInjectionPath = computed(() => this._getNodePathForSelectedService());

  private readonly _snapshotCache = signal<any>({error: 'No instance available'});

  readonly selectedServiceState = computed(() => this._snapshotCache());

  readonly maxNodeDeps = computed(() => this.maxFilteredServicesByNodeCache());

  /**
   * Aggregate counts over the CURRENTLY FILTERED tree (never the raw registry totals). `nodes` counts
   * every injector/component node the GLOBAL OPS filters kept — a grouped-siblings node counts once.
   * `dependencies` sums the visible service rows those nodes show when expanded. `rows` is the total
   * TREE rows when fully expanded (nodes + dependency rows). Expand-independent, so it does not flicker
   * as the user expands/collapses.
   */
  readonly filteredStats = computed<{ nodes: number; dependencies: number; rows: number }>(() => {
    const servicesByNodeId = this.filteredServicesByNodeId();
    let nodes = 0;
    let dependencies = 0;
    const stack = [...this.filteredTree()];
    while (stack.length > 0) {
      const node = stack.pop()!;
      nodes++;
      dependencies += servicesByNodeId.get(node.id)?.length ?? 0;
      if (node.children?.length) stack.push(...node.children);
    }
    return {nodes, dependencies, rows: nodes + dependencies};
  });

  setView(view: GenieViewType) {
    this.activeView.set(view);
  }

  toggleNode(nodeId: number) {
    const current = new Set(this.expandedIds());
    if (current.has(nodeId)) current.delete(nodeId); else current.add(nodeId);
    this.expandedIds.set(current);
  }

  expandAll() {
    const tree = this.filteredTree();
    const runId = ++this.expandAllRunId;
    this._cancelScheduledExpandAll();

    if (!this.isBrowser) {
      this.expandedIds.set(this._collectExpandedIdsSync(tree));
      return;
    }

    this.zone.runOutsideAngular(() => this._scheduleExpandAllChunk(() => {
      this._collectExpandedIdsChunked(tree, runId);
    }));
  }

  collapseAll() {
    this._cancelScheduledExpandAll();
    this.expandedIds.set(new Set<number>());
  }

  /**
   * Freeze the visible filtered tree at its current state. The overlay calls this during a live route
   * re-scan so the graph transitions directly from the old route's result to the new one, instead of
   * flickering through the "old removed / new not yet scanned" gap and the scan's transient over-show.
   * Automatically released when the ensuing scan settles (or by the caller as a safety net).
   */
  suspendTreeUpdates(): void {
    this._sawScanSinceSuspend = false;
    this._treeUpdatesSuspended.set(true);
  }

  resumeTreeUpdates(): void {
    if (this._treeUpdatesSuspended()) this._treeUpdatesSuspended.set(false);
  }

  selectDependency(s: GenieServiceRegistration) {
    const node = this._findNodeById(s.nodeId);
    if (node) this.selectedNode.set(node);
    this.selectedService.set(s);
  }

  selectNode(n: GenieTreeNode) {
    this.selectedNode.set(n);
    this.selectedService.set(null);
  }

  clearSelection() {
    this.selectedNode.set(null);
    this.selectedService.set(null);
  }

  getConsumerNamesForService(serviceId: number): string[] {
    const dependencies = this.dependencies();
    if (this.serviceConsumerNamesCacheSource !== dependencies) {
      this.serviceConsumerNamesCacheSource = dependencies;
      this.serviceConsumerNamesCache.clear();
    }

    const cached = this.serviceConsumerNamesCache.get(serviceId);
    if (cached) return cached;

    const consumerNames = new Set<string>();
    for (const dependency of this.registry.getDependenciesForService(serviceId)) {
      const consumerNode = this.registry.getNodeById(dependency.consumerNodeId);
      consumerNames.add(consumerNode?.label || `Node #${dependency.consumerNodeId}`);
    }

    const names = Array.from(consumerNames);
    this.serviceConsumerNamesCache.set(serviceId, names);
    return names;
  }

  getProvidersForNode(nodeId: number): GenieServiceRegistration[] {
    return this._getFilteredServicesForNode(nodeId);
  }

  /**
   * Serialize the currently filtered TREE to pretty JSON — a sanitized projection that drops the live
   * `injector` / `componentInstance` references (circular, non-serializable) and inlines each node's
   * visible dependencies. Element count equals {@link filteredStats}.rows, so the export and the
   * on-screen count always agree. Handy for debugging, sharing, and asserting filter output in tests.
   */
  exportFilteredTreeAsJson(): string {
    const project = (node: GenieTreeNode): Record<string, unknown> => ({
      id: node.id,
      label: node.label,
      type: node.type,
      parentId: node.parentId ?? null,
      ...(node.groupCount ? {groupCount: node.groupCount} : {}),
      dependencies: this._getFilteredServicesForNode(node.id).map(service => ({
        id: service.id,
        label: service.label,
        dependencyType: service.dependencyType,
        providerType: service.providerType,
        usageCount: service.usageCount,
        isRoot: service.isRoot,
        isFramework: service.isFramework
      })),
      children: (node.children ?? []).map(project)
    });
    return JSON.stringify(this.filteredTree().map(project), null, 2);
  }

  private _calculateFilteredTree(
    root: GenieTreeNode[],
    filters: GenieFilterState,
    query: string,
    isDeepFocus: boolean,
    isScanActive: boolean,
    selectedNode: GenieTreeNode | null,
    servicesByNodeId: Map<number, GenieServiceRegistration[]>
  ): GenieTreeNode[] {

    let pathIds = new Set<number>();
    if (isDeepFocus && selectedNode) {
      pathIds = this._getIdsForDeepFocusPath(selectedNode.id);
    }

    const normalizedQuery = query.trim().toLowerCase();

    const filterNode = (node: GenieTreeNode, forceInclude: boolean): GenieTreeNode | null => {

      let isForcedByDeepFocus = forceInclude;

      if (isDeepFocus && selectedNode) {
        if (!isForcedByDeepFocus) {
          if (node.id === selectedNode.id) {
            isForcedByDeepFocus = true;
          } else if (!pathIds.has(node.id)) {
            return null;
          }
        }
      }

      const services = servicesByNodeId.get(node.id) ?? [];
      const effectiveCount = services.length;
      const canApplyCompletenessFilters = !isScanActive;

      let matchesSelf = true;


      if (canApplyCompletenessFilters && filters.hideIsolatedComponents && (!node.children || node.children.length === 0)) {
        if (!isForcedByDeepFocus) return null;
      }

      if (canApplyCompletenessFilters && filters.hideUnusedDeps) {
        const activeServices = services.filter(s => (s.usageCount || 0) > 0);
        if (activeServices.length === 0 && (!node.children || node.children.length === 0)) {
          if (!isForcedByDeepFocus) return null;
        }
      }

      const hasTextSearch = normalizedQuery.length > 0;
      const hasCompTags = filters.componentTags && filters.componentTags.length > 0;
      const hasDepTags = filters.dependencyTags && filters.dependencyTags.length > 0;
      const hasActiveSearchOrFilter = hasTextSearch || hasCompTags || hasDepTags;

      if (hasActiveSearchOrFilter && !isForcedByDeepFocus) {
        if (hasTextSearch && !node.label.toLowerCase().includes(normalizedQuery)) {
          matchesSelf = false;
        }

        if (matchesSelf && hasCompTags) {
          if (!filters.componentTags.includes(node.label)) {
            matchesSelf = false;
          }
        }

        if (matchesSelf && hasDepTags) {
          const nodeServiceLabels = new Set(services.map(s => s.label));
          if (filters.matchMode === 'AND') {
            if (!filters.dependencyTags.every(tag => nodeServiceLabels.has(tag))) {
              matchesSelf = false;
            }
          } else {
            if (!filters.dependencyTags.some(tag => nodeServiceLabels.has(tag))) {
              matchesSelf = false;
            }
          }
        }
      } else {
        if (!isForcedByDeepFocus) {
          matchesSelf = effectiveCount >= filters.minDeps && effectiveCount <= filters.maxDeps;
        }
      }

      let filteredChildren = (node.children || [])
        .map(child => filterNode(child, isForcedByDeepFocus))
        .filter((n): n is GenieTreeNode => n !== null);

      if (filters.groupSimilarSiblings && filteredChildren.length > 1) {
        filteredChildren = this._groupIdenticalSiblings(filteredChildren, servicesByNodeId);
      }

      if (matchesSelf || filteredChildren.length > 0 || isForcedByDeepFocus) {
        return {...node, children: filteredChildren};
      }
      return null;
    };

    return root.map(rootNode => filterNode(rootNode, false)).filter((n): n is GenieTreeNode => n !== null);
  }

  private _scheduleRawTreeRebuild(nodes: GenieNode[]): void {
    const runId = ++this.rawTreeRunId;
    this._cancelScheduledRawTreeRebuild();
    this._cancelScheduledFilterTreeRebuild();

    if (!this.isBrowser) {
      const completeSpan = this.performance.startSpan('tree.raw.sync', {nodes: nodes.length});
      const result = this._buildRawTreeSync(nodes);
      this.rawTreeCache.set(result.roots);
      this.treeNodeByIdCache.set(result.byId);
      completeSpan({roots: result.roots.length, treeNodes: result.byId.size});
      return;
    }

    this.zone.runOutsideAngular(() => {
      this._scheduleRawTreeChunk(() => this._buildRawTreeChunked(nodes, runId));
    });
  }

  private _buildRawTreeSync(nodes: GenieNode[]): { roots: GenieTreeNode[]; byId: Map<number, GenieTreeNode> } {
    const byId = new Map<number, GenieTreeNode>();
    const roots: GenieTreeNode[] = [];

    for (const node of nodes) {
      byId.set(node.id, {...node, children: []});
    }

    for (const node of byId.values()) {
      if (node.parentId == null) {
        roots.push(node);
      } else {
        const parent = byId.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }

    return {roots, byId};
  }

  private _collectExpandedIdsSync(tree: GenieTreeNode[]): Set<number> {
    const all = new Set<number>();
    const stack = [...tree];

    while (stack.length > 0) {
      const node = stack.pop()!;
      all.add(node.id);
      if (node.children?.length) {
        stack.push(...node.children);
      }
    }

    return all;
  }

  private _collectExpandedIdsChunked(tree: GenieTreeNode[], runId: number): void {
    const all = new Set<number>();
    const stack = [...tree].reverse();

    const processChunk = () => {
      if (this.isDestroyed || runId !== this.expandAllRunId) return;

      const startedAt = this._now();
      while (stack.length > 0 && this._now() - startedAt < EXPAND_ALL_CHUNK_BUDGET_MS) {
        const node = stack.pop()!;
        all.add(node.id);

        if (node.children?.length) {
          for (let index = node.children.length - 1; index >= 0; index--) {
            stack.push(node.children[index]);
          }
        }
      }

      if (stack.length > 0) {
        this._scheduleExpandAllChunk(processChunk);
        return;
      }

      if (this.isDestroyed || runId !== this.expandAllRunId) return;
      this.zone.run(() => this.expandedIds.set(all));
    };

    processChunk();
  }

  private _scheduleExpandAllChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      this.expandAllIdleHandle = win.requestIdleCallback(callback, {timeout: 100});
      return;
    }

    this.expandAllTimer = setTimeout(callback, 0);
  }

  private _cancelScheduledExpandAll(): void {
    if (this.expandAllTimer) {
      clearTimeout(this.expandAllTimer);
      this.expandAllTimer = null;
    }

    const win = typeof window !== 'undefined' ? window as any : null;
    if (this.expandAllIdleHandle !== null && win && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(this.expandAllIdleHandle);
    }
    this.expandAllIdleHandle = null;
  }

  private _buildRawTreeChunked(nodes: GenieNode[], runId: number): void {
    const completeSpan = this.performance.startSpan('tree.raw.chunked', {nodes: nodes.length});
    const state: RawTreeBuildState = {
      sourceNodes: nodes,
      byId: new Map<number, GenieTreeNode>(),
      roots: [],
      phase: 'clone',
      cursor: 0
    };

    const processChunk = () => {
      if (this.isDestroyed || runId !== this.rawTreeRunId) return;

      const startedAt = this._now();

      while (this._now() - startedAt < TREE_REBUILD_CHUNK_BUDGET_MS) {
        if (state.phase === 'clone') {
          if (state.cursor >= state.sourceNodes.length) {
            state.phase = 'link';
            state.cursor = 0;
            continue;
          }

          const node = state.sourceNodes[state.cursor];
          state.byId.set(node.id, {...node, children: []});
          state.cursor++;
          continue;
        }

        if (state.cursor >= state.sourceNodes.length) {
          if (runId !== this.rawTreeRunId || this.isDestroyed) return;
          this.zone.run(() => {
            this.treeNodeByIdCache.set(state.byId);
            this.rawTreeCache.set(state.roots);
            completeSpan({roots: state.roots.length, treeNodes: state.byId.size});
          });
          return;
        }

        const sourceNode = state.sourceNodes[state.cursor];
        const node = state.byId.get(sourceNode.id);
        if (node) {
          if (node.parentId == null) {
            state.roots.push(node);
          } else {
            const parent = state.byId.get(node.parentId);
            if (parent) {
              parent.children.push(node);
            } else {
              state.roots.push(node);
            }
          }
        }
        state.cursor++;
      }

      this._scheduleRawTreeChunk(processChunk);
    };

    processChunk();
  }

  private _scheduleRawTreeChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      this.rawTreeIdleHandle = win.requestIdleCallback(callback, {timeout: 100});
      return;
    }

    this.rawTreeTimer = setTimeout(callback, 0);
  }

  private _cancelScheduledRawTreeRebuild(): void {
    if (this.rawTreeTimer) {
      clearTimeout(this.rawTreeTimer);
      this.rawTreeTimer = null;
    }

    const win = typeof window !== 'undefined' ? window as any : null;
    if (this.rawTreeIdleHandle !== null && win && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(this.rawTreeIdleHandle);
    }
    this.rawTreeIdleHandle = null;
  }

  private _scheduleFilteredServicesRebuild(
    services: GenieServiceRegistration[],
    filters: GenieFilterState
  ): void {
    const runId = ++this.filteredServicesRunId;
    this._cancelScheduledFilteredServicesRebuild();
    this._cancelScheduledFilterTreeRebuild();

    if (!this.isBrowser) {
      const completeSpan = this.performance.startSpan('tree.filteredServices.sync', {services: services.length});
      const result = this._buildFilteredServicesByNodeId(services, filters);
      this.filteredServicesByNodeIdCache.set(result.index);
      this.maxFilteredServicesByNodeCache.set(result.maxDeps);
      completeSpan({nodes: result.index.size, maxDeps: result.maxDeps});
      return;
    }

    this.zone.runOutsideAngular(() => {
      this._scheduleFilteredServicesChunk(() => {
        this._buildFilteredServicesByNodeIdChunked(services, filters, runId);
      });
    });
  }

  private _buildFilteredServicesByNodeId(
    services: GenieServiceRegistration[],
    filters: GenieFilterState
  ): FilteredServicesIndexResult {
    const index = new Map<number, GenieServiceRegistration[]>();
    let maxDeps = 0;
    for (const service of services) {
      const count = this._addFilteredServiceToIndex(service, filters, index);
      if (count > maxDeps) maxDeps = count;
    }
    return {index, maxDeps};
  }

  private _buildFilteredServicesByNodeIdChunked(
    services: GenieServiceRegistration[],
    filters: GenieFilterState,
    runId: number
  ): void {
    const completeSpan = this.performance.startSpan('tree.filteredServices.chunked', {services: services.length});
    const index = new Map<number, GenieServiceRegistration[]>();
    let cursor = 0;
    let maxDeps = 0;

    const processChunk = () => {
      if (this.isDestroyed || runId !== this.filteredServicesRunId) return;

      const startedAt = this._now();
      while (cursor < services.length && this._now() - startedAt < FILTERED_SERVICES_CHUNK_BUDGET_MS) {
        const count = this._addFilteredServiceToIndex(services[cursor], filters, index);
        if (count > maxDeps) maxDeps = count;
        cursor++;
      }

      if (cursor < services.length) {
        this._scheduleFilteredServicesChunk(processChunk);
        return;
      }

      if (runId !== this.filteredServicesRunId || this.isDestroyed) return;
      this.zone.run(() => {
        this.filteredServicesByNodeIdCache.set(index);
        this.maxFilteredServicesByNodeCache.set(maxDeps);
        completeSpan({nodes: index.size, maxDeps});
      });
    };

    processChunk();
  }

  private _addFilteredServiceToIndex(
    service: GenieServiceRegistration,
    filters: GenieFilterState,
    index: Map<number, GenieServiceRegistration[]>
  ): number {
    if (!this._serviceMatchesFilters(service, filters)) return 0;

    const list = index.get(service.nodeId);
    if (list) {
      list.push(service);
      return list.length;
    } else {
      index.set(service.nodeId, [service]);
      return 1;
    }
  }

  private _scheduleFilteredServicesChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      this.filteredServicesIdleHandle = win.requestIdleCallback(callback, {timeout: 100});
      return;
    }

    this.filteredServicesTimer = setTimeout(callback, 0);
  }

  private _cancelScheduledFilteredServicesRebuild(): void {
    if (this.filteredServicesTimer) {
      clearTimeout(this.filteredServicesTimer);
      this.filteredServicesTimer = null;
    }

    const win = typeof window !== 'undefined' ? window as any : null;
    if (
      this.filteredServicesIdleHandle !== null
      && win
      && typeof win.cancelIdleCallback === 'function'
    ) {
      win.cancelIdleCallback(this.filteredServicesIdleHandle);
    }
    this.filteredServicesIdleHandle = null;
  }

  private _scheduleFilteredTreeRebuild(params: FilterTreeParams): void {
    const runId = ++this.filterTreeRunId;
    this._cancelScheduledFilterTreeRebuild();

    if (!this.isBrowser) {
      const completeSpan = this.performance.startSpan('tree.filtered.sync', {
        roots: params.root.length,
        servicesByNode: params.servicesByNodeId.size
      });
      const filteredTree = this._calculateFilteredTree(
        params.root,
        params.filters,
        params.query,
        params.isDeepFocus,
        params.isScanActive,
        params.selectedNode,
        params.servicesByNodeId
      );
      this.filteredTreeCache.set(filteredTree);
      completeSpan({roots: filteredTree.length});
      return;
    }

    this.zone.runOutsideAngular(() => {
      this._scheduleFilterChunk(() => this._calculateFilteredTreeChunked(params, runId));
    });
  }

  private _calculateFilteredTreeChunked(params: FilterTreeParams, runId: number): void {
    const completeSpan = this.performance.startSpan('tree.filtered.chunked', {
      roots: params.root.length,
      servicesByNode: params.servicesByNodeId.size
    });
    const prepared = this._prepareFilterParams(params);
    const rootFrame: FilterTreeFrame = {
      node: null,
      children: prepared.root,
      childIndex: 0,
      filteredChildren: [],
      forceInclude: false,
      matchesSelf: false
    };
    const stack: FilterTreeFrame[] = [rootFrame];

    const processChunk = () => {
      if (this.isDestroyed || runId !== this.filterTreeRunId) return;

      const startedAt = this._now();

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];

        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          frame.childIndex++;

          const childFrame = this._createFilterTreeFrame(child, frame.forceInclude, prepared);
          if (childFrame) stack.push(childFrame);
        } else {
          stack.pop();
          const outputNode = this._completeFilterTreeFrame(frame, prepared);
          const parent = stack[stack.length - 1];

          if (parent && outputNode) {
            parent.filteredChildren.push(outputNode);
          }
        }

        if (this._now() - startedAt >= FILTER_REBUILD_CHUNK_BUDGET_MS) {
          break;
        }
      }

      if (stack.length > 0) {
        this._scheduleFilterChunk(processChunk);
        return;
      }

      if (runId !== this.filterTreeRunId || this.isDestroyed) return;
      const nextTree = rootFrame.filteredChildren;
      this.zone.run(() => {
        this.filteredTreeCache.set(nextTree);
        completeSpan({roots: nextTree.length});
      });
    };

    processChunk();
  }

  private _prepareFilterParams(params: FilterTreeParams): FilterTreePreparedParams {
    let pathIds = new Set<number>();
    if (params.isDeepFocus && params.selectedNode) {
      pathIds = this._getIdsForDeepFocusPath(params.selectedNode.id);
    }

    const normalizedQuery = params.query.trim().toLowerCase();
    const componentTags = new Set(params.filters.componentTags ?? []);
    const dependencyTags = new Set(params.filters.dependencyTags ?? []);
    const hasTextSearch = normalizedQuery.length > 0;
    const hasCompTags = componentTags.size > 0;
    const hasDepTags = dependencyTags.size > 0;

    return {
      ...params,
      pathIds,
      normalizedQuery,
      componentTags,
      dependencyTags,
      hasTextSearch,
      hasCompTags,
      hasDepTags,
      hasActiveSearchOrFilter: hasTextSearch || hasCompTags || hasDepTags
    };
  }

  private _createFilterTreeFrame(
    node: GenieTreeNode,
    forceInclude: boolean,
    params: FilterTreePreparedParams
  ): FilterTreeFrame | null {
    let isForcedByDeepFocus = forceInclude;
    const filters = params.filters;

    if (params.isDeepFocus && params.selectedNode) {
      if (!isForcedByDeepFocus) {
        if (node.id === params.selectedNode.id) {
          isForcedByDeepFocus = true;
        } else if (!params.pathIds.has(node.id)) {
          return null;
        }
      }
    }

    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const services = params.servicesByNodeId.get(node.id) ?? [];
    const canApplyCompletenessFilters = !params.isScanActive;

    if (canApplyCompletenessFilters && filters.hideIsolatedComponents && !hasChildren && !isForcedByDeepFocus) {
      return null;
    }

    if (canApplyCompletenessFilters && filters.hideUnusedDeps && !hasChildren && !isForcedByDeepFocus) {
      let hasUsedService = false;
      for (const service of services) {
        if ((service.usageCount || 0) > 0) {
          hasUsedService = true;
          break;
        }
      }
      if (!hasUsedService) return null;
    }

    let matchesSelf = true;

    if (params.hasActiveSearchOrFilter && !isForcedByDeepFocus) {
      if (params.hasTextSearch && !node.label.toLowerCase().includes(params.normalizedQuery)) {
        matchesSelf = false;
      }

      if (matchesSelf && params.hasCompTags && !params.componentTags.has(node.label)) {
        matchesSelf = false;
      }

      if (matchesSelf && params.hasDepTags) {
        matchesSelf = this._nodeMatchesDependencyTags(
          services,
          params.dependencyTags,
          filters.matchMode
        );
      }
    } else if (!isForcedByDeepFocus) {
      const effectiveCount = services.length;
      matchesSelf = effectiveCount >= filters.minDeps && effectiveCount <= filters.maxDeps;
    }

    return {
      node,
      children,
      childIndex: 0,
      filteredChildren: [],
      forceInclude: isForcedByDeepFocus,
      matchesSelf
    };
  }

  private _completeFilterTreeFrame(
    frame: FilterTreeFrame,
    params: FilterTreePreparedParams
  ): GenieTreeNode | null {
    if (!frame.node) return null;

    let filteredChildren = frame.filteredChildren;
    if (params.filters.groupSimilarSiblings && filteredChildren.length > 1) {
      filteredChildren = this._groupIdenticalSiblings(filteredChildren, params.servicesByNodeId);
    }

    if (frame.matchesSelf || filteredChildren.length > 0 || frame.forceInclude) {
      return {...frame.node, children: filteredChildren};
    }

    return null;
  }

  private _nodeMatchesDependencyTags(
    services: GenieServiceRegistration[],
    dependencyTags: Set<string>,
    matchMode: GenieFilterState['matchMode']
  ): boolean {
    if (services.length === 0) return false;

    const labels = new Set<string>();
    for (const service of services) labels.add(service.label);

    if (matchMode === 'AND') {
      for (const tag of dependencyTags) {
        if (!labels.has(tag)) return false;
      }
      return true;
    }

    for (const tag of dependencyTags) {
      if (labels.has(tag)) return true;
    }
    return false;
  }

  private _scheduleFilterChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      this.filterTreeIdleHandle = win.requestIdleCallback(callback, {timeout: 100});
      return;
    }

    this.filterTreeTimer = setTimeout(callback, 0);
  }

  private _cancelScheduledFilterTreeRebuild(): void {
    if (this.filterTreeTimer) {
      clearTimeout(this.filterTreeTimer);
      this.filterTreeTimer = null;
    }

    const win = typeof window !== 'undefined' ? window as any : null;
    if (this.filterTreeIdleHandle !== null && win && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(this.filterTreeIdleHandle);
    }
    this.filterTreeIdleHandle = null;
  }

  private _now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private _groupIdenticalSiblings(
    siblings: GenieTreeNode[],
    servicesByNodeId: Map<number, GenieServiceRegistration[]>
  ): GenieTreeNode[] {
    const groups = new Map<string, GenieTreeNode[]>();
    const result: GenieTreeNode[] = [];
    for (const node of siblings) {
      const hasChildren = (node.children?.length ?? 0) > 0;
      const hasServices = (servicesByNodeId.get(node.id)?.length ?? 0) > 0;
      if (hasChildren || hasServices) {
        result.push(node);
        continue;
      }

      const key = `${node.label}|${node.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(node);
    }
    groups.forEach((groupNodes) => {
      if (groupNodes.length === 1) {
        result.push(groupNodes[0]);
      } else {
        const first = groupNodes[0];
        result.push({
          ...first,
          id: -Math.abs(first.id),
          children: first.children || [],
          groupCount: groupNodes.length
        });
      }
    });
    return result;
  }

  private _getFilteredServicesForNode(nodeId: number): GenieServiceRegistration[] {
    return this.filteredServicesByNodeId().get(nodeId) ?? [];
  }

  private _serviceMatchesFilters(s: GenieServiceRegistration, filters: GenieFilterState): boolean {
    if (filters.showRootOnly && !(s.isRoot === true || s.token?.['ɵprov']?.providedIn === 'root')) {
      return false;
    }
    if (filters.showLocalOnly && (s.isRoot === true || s.token?.['ɵprov']?.providedIn === 'root')) {
      return false;
    }
    if (filters.hideUnusedDeps && (s.usageCount || 0) === 0) {
      return false;
    }

    // A token the user explicitly pinned visible (Advanced config → "Show") bypasses the
    // internal + per-type gates, so the action always takes effect regardless of the toggles.
    if (this.filterService.isForceShown(s.label)) return true;

    const type = s.dependencyType;
    const isFramework = s.isFramework;

    if (filters.hideInternals && isFramework) return false;

    if (!isFramework) {
      if (type === 'Service' && !filters.showUserServices) return false;
      if (type === 'Pipe' && !filters.showUserPipes) return false;
      if (type === 'Directive' && !filters.showUserDirectives) return false;
      if (type === 'Component' && !filters.showUserComponents) return false;
      if (type === 'Token' && !filters.showUserTokens) return false;
      if (type === 'Value' && !filters.showUserValues) return false;
      if (type === 'Observable' && !filters.showUserObservables) return false;
      if (type === 'Signal' && !filters.showUserSignals) return false;
      return true;
    }

    if (type === 'Service' && !filters.showFrameworkServices) return false;
    if (type === 'System' && !filters.showFrameworkSystem) return false;
    if (type === 'Pipe' && !filters.showFrameworkPipes) return false;
    if (type === 'Directive' && !filters.showFrameworkDirectives) return false;
    if (type === 'Component' && !filters.showFrameworkComponents) return false;
    if (type === 'Token' && !filters.showFrameworkTokens) return false;
    if (type === 'Observable' && !filters.showFrameworkObservables) return false;
    if (type === 'Signal' && !filters.showFrameworkSignals) return false;

    return true;
  }

  private _getIdsForDeepFocusPath(targetId: number): Set<number> {
    const path = new Set<number>();
    let curr = this._findNodeById(targetId);
    while (curr) {
      path.add(curr.id);
      if (curr.parentId == null) break;
      curr = this._findNodeById(curr.parentId);
    }
    return path;
  }

  private _safeScan(obj: any, depth = 0): any {
    if (depth > 2) return '[Deep Object]';
    if (!obj || typeof obj !== 'object') return obj;
    const result: any = {};
    for (const key in obj) {
      if (key.startsWith('__') || key.startsWith('ng') || key.startsWith('ɵ')) continue;
      try {
        const value = obj[key];
        if (isSignal(value)) {
          result[key] = untracked(() => value());
        } else {
          result[key] = value;
        }
      } catch (e) {
        result[key] = '[Access Error]';
      }
    }
    return result;
  }

  private _getNodePathForSelectedService(): GenieTreeNode[] {
    const svc = this.selectedService();
    if (!svc) return [];

    const path: GenieTreeNode[] = [];
    let curr = this._findNodeById(svc.nodeId);
    while (curr) {
      path.unshift(curr);
      if (curr.parentId == null) break;
      curr = this._findNodeById(curr.parentId);
    }
    return path;
  }

  private _findNodeById(id: number): GenieTreeNode | null {
    return this.treeNodeById().get(id) ?? null;
  }

  private _loadLiveWatchState(): boolean {
    if (!this.isBrowser) return true;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LIVE_WATCH);
      return stored !== null ? stored === 'true' : true;
    } catch (e) {
      return true;
    }
  }

  private _saveLiveWatchState(isLive: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY_LIVE_WATCH, String(isLive));
    } catch (e) {
      console.warn('Genie: Failed to save live watch state', e);
    }
  }
}
