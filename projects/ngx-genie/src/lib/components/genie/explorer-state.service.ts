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
import {GenieServiceRegistration, GenieTreeNode} from '../../models/genie-node.model';
import {buildGenieTree} from '../../utils/genie-tree.util';
import {GenieFilterState} from './options-panel/options-panel.models';

export type GenieViewType = 'tree' | 'org' | 'matrix' | 'constellation' | 'diagnostics';

const STORAGE_KEY_LIVE_WATCH = 'genie_live_watch_enabled';

@Injectable()
export class GenieExplorerStateService {
  private readonly registry = inject(GenieRegistryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private liveTimer: any = null;

  readonly nodes = computed(() => this.registry.nodes());
  readonly services = computed(() => this.registry.services());
  readonly dependencies = computed(() => this.registry.dependencies());
  readonly stats = computed(() => ({nodes: this.nodes().length, services: this.services().length}));

  private readonly rawTree = computed<GenieTreeNode[]>(() => buildGenieTree(this.nodes()));

  private readonly treeNodeById = computed(() => {
    const index = new Map<number, GenieTreeNode>();
    const walk = (nodes: GenieTreeNode[]) => {
      for (const node of nodes) {
        index.set(node.id, node);
        if (node.children.length > 0) walk(node.children);
      }
    };
    walk(this.rawTree());
    return index;
  });

  private readonly filteredServicesByNodeId = computed(() => {
    const filters = this.filterState();
    const index = new Map<number, GenieServiceRegistration[]>();

    for (const service of this.services()) {
      if (!this._serviceMatchesFilters(service, filters)) continue;
      const list = index.get(service.nodeId);
      if (list) {
        list.push(service);
      } else {
        index.set(service.nodeId, [service]);
      }
    }

    return index;
  });


  readonly serviceConsumersMap = computed(() => {
    const deps = this.dependencies();
    const sets = new Map<number, Set<string>>();

    deps.forEach(dep => {
      if (dep.providerId !== null) {
        if (!sets.has(dep.providerId)) {
          sets.set(dep.providerId, new Set<string>());
        }
        const consumerNode = this.registry.getNodeById(dep.consumerNodeId);
        const consumerName = consumerNode?.label || `Node #${dep.consumerNodeId}`;
        sets.get(dep.providerId)!.add(consumerName);
      }
    });

    const map = new Map<number, string[]>();
    sets.forEach((consumerNames, serviceId) => {
      map.set(serviceId, Array.from(consumerNames));
    });
    return map;
  });

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

  readonly filterState = signal<GenieFilterState>({
    hideUnusedDeps: false,
    hideIsolatedComponents: false,
    hideInternals: false,
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
    showUserSignals: true,

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

    this.destroyRef.onDestroy(() => {
      if (this.liveTimer) clearInterval(this.liveTimer);
    });
  }

  readonly filteredTree = computed<GenieTreeNode[]>(() => {
    return this._calculateFilteredTree(
      this.rawTree(),
      this.filterState(),
      this.searchQuery(),
      this.isDeepFocusMode(),
      this.selectedNode(),
      this.filteredServicesByNodeId()
    );
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

  readonly maxNodeDeps = computed(() => {
    const nodes = this.nodes();
    if (nodes.length === 0) return 0;
    const servicesByNodeId = this.filteredServicesByNodeId();
    let max = 0;
    for (const node of nodes) {
      const count = servicesByNodeId.get(node.id)?.length ?? 0;
      if (count > max) max = count;
    }
    return max;
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
    const all = new Set<number>();
    const walk = (nodes: GenieTreeNode[]) => {
      for (const n of nodes) {
        all.add(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(this.filteredTree());
    this.expandedIds.set(all);
  }

  collapseAll() {
    this.expandedIds.set(new Set<number>());
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

  getProvidersForNode(nodeId: number): GenieServiceRegistration[] {
    return this._getFilteredServicesForNode(nodeId);
  }

  private _calculateFilteredTree(
    root: GenieTreeNode[],
    filters: GenieFilterState,
    query: string,
    isDeepFocus: boolean,
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

      let matchesSelf = true;


      if (filters.hideIsolatedComponents && (!node.children || node.children.length === 0)) {
        if (!isForcedByDeepFocus) return null;
      }

      if (filters.hideUnusedDeps) {
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
        filteredChildren = this._groupIdenticalSiblings(filteredChildren);
      }

      if (matchesSelf || filteredChildren.length > 0 || isForcedByDeepFocus) {
        return {...node, children: filteredChildren};
      }
      return null;
    };

    return root.map(rootNode => filterNode(rootNode, false)).filter((n): n is GenieTreeNode => n !== null);
  }

  private _groupIdenticalSiblings(siblings: GenieTreeNode[]): GenieTreeNode[] {
    const groups = new Map<string, GenieTreeNode[]>();
    const result: GenieTreeNode[] = [];
    for (const node of siblings) {
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
