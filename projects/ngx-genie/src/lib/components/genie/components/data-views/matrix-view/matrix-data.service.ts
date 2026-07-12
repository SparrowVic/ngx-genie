import {Injectable, inject, NgZone, signal, OnDestroy} from '@angular/core';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {
  GenieDependency,
  GenieDependencyType,
  GenieServiceRegistration,
  GenieTreeNode
} from '../../../../../models/genie-node.model';
import {MatrixWorkerResult, ProcessedColumn, ProcessedRow, MATRIX_WORKER_SOURCE, calculateMatrix} from './matrix.worker';
import {GeniePerformanceService} from '../../../../../services/genie-performance.service';
import {GenFilterService} from '../../../../../services/filter.service';

export interface MatrixViewState {
  scale: number;
  scrollX: number;
  scrollY: number;
}

interface MatrixCalculationInputKey {
  tree: readonly GenieTreeNode[];
  filter: GenieFilterState | null;
  services: readonly GenieServiceRegistration[];
  dependencies: readonly GenieDependency[];
}

interface SafeMatrixService {
  id: number;
  nodeId: number;
  label: string;
  dependencyType: GenieDependencyType;
  usageCount: number;
  isRoot: boolean;
  isFramework: boolean;
}

interface SafeMatrixDependency {
  providerId: number | null;
  consumerNodeId: number;
  propName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MatrixDataService implements OnDestroy {
  private readonly registry = inject(GenieRegistryService);
  private readonly ngZone = inject(NgZone);
  private readonly performance = inject(GeniePerformanceService);
  private readonly filterService = inject(GenFilterService);

  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private calculationRequestId = 0;
  private lastCalculationInput: MatrixCalculationInputKey | null = null;
  private cachedTreeSource: readonly GenieTreeNode[] | null = null;
  private cachedTreeRows: Array<{ id: number; label: string }> = [];
  private cachedServicesSource: readonly GenieServiceRegistration[] | null = null;
  private cachedSafeServices: SafeMatrixService[] = [];
  private cachedDependenciesSource: readonly GenieDependency[] | null = null;
  private cachedSafeDependencies: SafeMatrixDependency[] = [];

  readonly isWorkerDone = signal(false);
  readonly rows = signal<ProcessedRow[]>([]);
  readonly columns = signal<ProcessedColumn[]>([]);
  readonly totalRows = signal(0);
  readonly totalCols = signal(0);


  private _viewState: MatrixViewState = {scale: 1.0, scrollX: 0, scrollY: 0};

  get viewState() {
    return this._viewState;
  }

  saveViewState(state: MatrixViewState) {
    this._viewState = state;
  }

  initWorker() {
    if (typeof Worker !== 'undefined' && !this.worker) {
      try {
        const blob = new Blob([MATRIX_WORKER_SOURCE], {type: 'application/javascript'});
        this.workerUrl = URL.createObjectURL(blob);

        this.worker = new Worker(this.workerUrl);

        this.worker.onmessage = ({data}) => {
          if (data.type === 'RESULT') {
            if (data.requestId !== this.calculationRequestId) return;

            const result = data.payload as MatrixWorkerResult;
            this.ngZone.run(() => this.applyResult(result));
          }
        };
      } catch (e) {
        // e.g. a host CSP that forbids `blob:` workers throws here. Leave `this.worker` null and fall
        // back to computing on the main thread in calculate(), instead of hanging on the loader.
        console.error('Genie Matrix Worker Init Error (falling back to main thread):', e);
      }
    }
  }

  private applyResult(result: MatrixWorkerResult) {
    this.rows.set(result.rows);
    this.columns.set(result.columns);
    this.totalRows.set(result.metadata.totalRows);
    this.totalCols.set(result.metadata.totalCols);
    this.isWorkerDone.set(true);
  }

  calculate(tree: GenieTreeNode[], filter: GenieFilterState | null) {
    const allServices = this.registry.services();
    const dependencies = this.registry.dependencies();

    if (this.isSameCalculationInput(tree, filter, allServices, dependencies)) {
      this.performance.recordSample('matrix.calculate.skip', {
        treeRoots: tree.length,
        services: allServices.length,
        dependencies: dependencies.length
      });
      return;
    }

    this.lastCalculationInput = {tree, filter, services: allServices, dependencies};
    const requestId = ++this.calculationRequestId;

    if (this.rows().length === 0) {
      this.isWorkerDone.set(false);
    }

    const completePrepareSpan = this.performance.startSpan('matrix.preparePayload', {
      treeRoots: tree.length,
      services: allServices.length,
      dependencies: dependencies.length
    });
    const safeServices = this.getSafeServices(allServices);
    const filteredServices = safeServices.filter(s => this.shouldShowSafeService(s, filter));
    const safeDependencies = this.getSafeDependencies(dependencies);
    const treeRows = this.getTreeRowsForWorker(tree);

    const payload = {
      tree: treeRows,
      treeIsFlat: true,
      filterState: filter,
      services: filteredServices,
      dependencies: safeDependencies
    };

    completePrepareSpan({
      rows: treeRows.length,
      columns: filteredServices.length,
      dependencies: safeDependencies.length
    });

    if (this.worker) {
      this.worker.postMessage({type: 'CALCULATE', requestId, payload});
    } else {
      // No worker (e.g. blocked by a host CSP): compute synchronously on the main thread so the view
      // renders. The calc is pure and there is no async gap, so requestId is always current here.
      this.applyResult(calculateMatrix(payload as any));
    }
  }

  private isSameCalculationInput(
    tree: readonly GenieTreeNode[],
    filter: GenieFilterState | null,
    services: readonly GenieServiceRegistration[],
    dependencies: readonly GenieDependency[]
  ): boolean {
    const last = this.lastCalculationInput;
    return !!last
      && last.tree === tree
      && last.filter === filter
      && last.services === services
      && last.dependencies === dependencies;
  }

  private getTreeRowsForWorker(tree: readonly GenieTreeNode[]): Array<{ id: number; label: string }> {
    if (this.cachedTreeSource === tree) return this.cachedTreeRows;

    this.cachedTreeSource = tree;
    this.cachedTreeRows = this.flattenNodesForWorker(tree);
    return this.cachedTreeRows;
  }

  private getSafeServices(services: readonly GenieServiceRegistration[]): SafeMatrixService[] {
    if (this.cachedServicesSource === services) return this.cachedSafeServices;

    const safeServices: SafeMatrixService[] = new Array(services.length);
    for (let index = 0; index < services.length; index++) {
      const service = services[index];
      safeServices[index] = this.toSafeService(service);
    }

    this.cachedServicesSource = services;
    this.cachedSafeServices = safeServices;
    return safeServices;
  }

  private getSafeDependencies(dependencies: readonly GenieDependency[]): SafeMatrixDependency[] {
    if (this.cachedDependenciesSource === dependencies) return this.cachedSafeDependencies;

    const safeDependencies: SafeMatrixDependency[] = new Array(dependencies.length);
    for (let index = 0; index < dependencies.length; index++) {
      const dependency = dependencies[index];
      safeDependencies[index] = {
        providerId: dependency.providerId,
        consumerNodeId: dependency.consumerNodeId,
        propName: dependency.propName
      };
    }

    this.cachedDependenciesSource = dependencies;
    this.cachedSafeDependencies = safeDependencies;
    return safeDependencies;
  }

  private toSafeService(service: GenieServiceRegistration): SafeMatrixService {
    let isRoot = service.isRoot === true;
    if (!isRoot && service.token && (service.token as any)['ɵprov']) {
      isRoot = (service.token as any)['ɵprov'].providedIn === 'root';
    }

    return {
      id: service.id,
      nodeId: service.nodeId,
      label: service.label,
      dependencyType: service.dependencyType,
      usageCount: service.usageCount,
      isRoot,
      isFramework: service.isFramework,
    };
  }

  private flattenNodesForWorker(tree: readonly GenieTreeNode[]): Array<{ id: number; label: string }> {
    const rows: Array<{ id: number; label: string }> = [];
    const stack = [...tree].reverse();

    while (stack.length > 0) {
      const node = stack.pop()!;
      rows.push({id: node.id, label: node.label});

      if (node.children?.length) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return rows;
  }

  private shouldShowSafeService(s: SafeMatrixService, filters: GenieFilterState | null): boolean {
    if (!filters) return true;

    if (filters.showRootOnly) {
      if (!s.isRoot) return false;
    }
    if (filters.showLocalOnly) {
      if (s.isRoot) return false;
    }

    if (filters.hideUnusedDeps && (s.usageCount || 0) === 0) return false;

    // A token the user pinned visible (Advanced config → "Show") bypasses the internal + per-type
    // gates, matching explorer-state._serviceMatchesFilters so the matrix agrees with the tree view.
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
    } else {
      if (type === 'Service' && !filters.showFrameworkServices) return false;
      if (type === 'System' && !filters.showFrameworkSystem) return false;
      if (type === 'Pipe' && !filters.showFrameworkPipes) return false;
      if (type === 'Directive' && !filters.showFrameworkDirectives) return false;
      if (type === 'Component' && !filters.showFrameworkComponents) return false;
      if (type === 'Token' && !filters.showFrameworkTokens) return false;
      if (type === 'Observable' && !filters.showFrameworkObservables) return false;
      if (type === 'Signal' && !filters.showFrameworkSignals) return false;
    }

    return true;
  }

  ngOnDestroy() {
    if (this.worker) {
      this.worker.terminate();
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
    }
  }
}
