import {Injectable, inject, NgZone, signal, OnDestroy} from '@angular/core';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {MatrixWorkerResult, ProcessedColumn, ProcessedRow, matrixWorkerFn} from './matrix.worker';

export interface MatrixViewState {
  scale: number;
  scrollX: number;
  scrollY: number;
}

@Injectable({
  providedIn: 'root'
})
export class MatrixDataService implements OnDestroy {
  private readonly registry = inject(GenieRegistryService);
  private readonly ngZone = inject(NgZone);

  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private calculationRequestId = 0;

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
        const workerCode = `(${matrixWorkerFn.toString()})()`;
        const blob = new Blob([workerCode], {type: 'application/javascript'});
        this.workerUrl = URL.createObjectURL(blob);

        this.worker = new Worker(this.workerUrl);

        this.worker.onmessage = ({data}) => {
          if (data.type === 'RESULT') {
            if (data.requestId !== this.calculationRequestId) return;

            const result = data.payload as MatrixWorkerResult;
            this.ngZone.run(() => {
              this.rows.set(result.rows);
              this.columns.set(result.columns);
              this.totalRows.set(result.metadata.totalRows);
              this.totalCols.set(result.metadata.totalCols);
              this.isWorkerDone.set(true);
            });
          }
        };
      } catch (e) {
        console.error('Genie Matrix Worker Init Error:', e);
      }
    }
  }

  calculate(tree: GenieTreeNode[], filter: GenieFilterState | null) {
    if (!this.worker) return;

    const requestId = ++this.calculationRequestId;

    if (this.rows().length === 0) {
      this.isWorkerDone.set(false);
    }

    const allServices = this.registry.services();
    const filteredServices = allServices.filter(s => this.shouldShowService(s, filter));

    const safeServices = filteredServices.map(s => {
      let isRoot = s.isRoot;
      if (!isRoot && s.token && (s.token as any)['ɵprov']) {
        isRoot = (s.token as any)['ɵprov'].providedIn === 'root';
      }
      return {
        id: s.id,
        nodeId: s.nodeId,
        label: s.label,
        dependencyType: s.dependencyType,
        isRoot,
        isFramework: s.isFramework,
      };
    });

    const safeDependencies = this.registry.dependencies().map(d => ({
      providerId: d.providerId,
      consumerNodeId: d.consumerNodeId,
      propName: d.propName
    }));

    const payload = {
      tree: this.flattenNodesForWorker(tree),
      filterState: filter,
      services: safeServices,
      dependencies: safeDependencies
    };

    this.worker.postMessage({type: 'CALCULATE', requestId, payload});
  }

  private flattenNodesForWorker(tree: GenieTreeNode[]): Array<{ id: number; label: string }> {
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

  private shouldShowService(s: GenieServiceRegistration, filters: GenieFilterState | null): boolean {
    if (!filters) return true;

    if (filters.showRootOnly) {
      const isRoot = s.isRoot === true || s.token?.['ɵprov']?.providedIn === 'root';
      if (!isRoot) return false;
    }
    if (filters.showLocalOnly) {
      const isRoot = s.isRoot === true || s.token?.['ɵprov']?.providedIn === 'root';
      if (isRoot) return false;
    }

    if (filters.hideUnusedDeps && (s.usageCount || 0) === 0) return false;

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
