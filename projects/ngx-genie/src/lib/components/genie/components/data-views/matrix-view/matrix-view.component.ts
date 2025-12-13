import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {
  GenieDependency,
  GenieNode,
  GenieServiceRegistration,
  GenieTreeNode
} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {MatrixRainComponent} from './matrix-rain/matrix-rain.component';
import {MatrixCornerComponent} from './matrix-corner/matrix-corner.component';
import {MatrixLegendComponent} from './matrix-legend/matrix-legend.component';
import {MatrixSettings, MatrixSettingsComponent} from './matrix-settings/matrix-settings.component';
import {MatrixLoadingComponent} from './matrix-loading/matrix-loading.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {ANGULAR_INTERNALS} from '../../../../../configs/angular-internals';

export interface MatrixRow {
  node: GenieNode;
  cells: MatrixCell[];
}

export interface MatrixCell {
  id: string;
  isConsumer: boolean;
  isProvider: boolean;
  active: boolean;
  service?: GenieServiceRegistration;
  dependency?: GenieDependency;
  colIndex: number;
  typeClass: string;
  isFramework: boolean;
}

export interface MatrixColumn {
  id: number;
  label: string;
  totalCount: number;
  service: GenieServiceRegistration;
  typeClass: string;
  isFramework: boolean;
}

@Component({
  selector: 'lib-matrix-view',
  standalone: true,
  imports: [
    CommonModule,
    MatrixRainComponent,
    MatrixCornerComponent,
    MatrixSettingsComponent,
    MatrixLegendComponent,
    MatrixLoadingComponent
  ],
  templateUrl: './matrix-view.component.html',
  styleUrl: './matrix-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatrixViewComponent implements AfterViewInit, OnDestroy {
  private readonly registry = inject(GenieRegistryService);
  private readonly ngZone = inject(NgZone);
  private readonly el = inject(ElementRef);

  readonly tree = input.required<GenieTreeNode[]>();
  readonly filterState = input<GenieFilterState | null>(null);
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectService = input.required<(svc: GenieServiceRegistration) => void>();

  readonly rows = signal<MatrixRow[]>([]);
  readonly columns = signal<MatrixColumn[]>([]);
  readonly scale = signal<number>(1.0);
  readonly settings = signal<MatrixSettings>({rain: true, animation: true});

  readonly isWorkerDone = signal<boolean>(false);
  private readonly isAnimationDone = signal<boolean>(false);
  readonly isLoading = computed(() => !this.isWorkerDone() || !this.isAnimationDone());

  readonly headerTopRef = viewChild<ElementRef<HTMLElement>>('headerTop');
  readonly headerLeftRef = viewChild<ElementRef<HTMLElement>>('headerLeft');
  readonly dataViewportRef = viewChild<ElementRef<HTMLElement>>('dataViewport');
  readonly cornerComponent = viewChild(MatrixCornerComponent);

  private worker: Worker | null = null;
  private workerObjUrl: string | null = null;
  private wheelListener: any;

  readonly gridWidthStyle = computed(() => {
    const count = this.columns().length;
    return `calc(${count} * var(--cell-sz) + 150px)`;
  });

  constructor() {
    effect(() => {
      const tree = this.tree();
      const filter = this.filterState();

      untracked(() => {
        this.calculateData();
      });
    });
  }

  ngAfterViewInit(): void {
    this.initWorker();
    if (this.rows().length === 0) {
      this.calculateData();
    }
    this.setupZoomHandler();
  }

  ngOnDestroy(): void {
    if (this.worker) this.worker.terminate();
    if (this.workerObjUrl) URL.revokeObjectURL(this.workerObjUrl);
    this.removeZoomHandler();
  }

  onLoadingAnimationComplete() {
    this.isAnimationDone.set(true);
  }

  updateSettings(newSettings: MatrixSettings) {
    this.settings.set(newSettings);
  }

  forceLayoutUpdate() {
    this.scale.set(1.0);
    setTimeout(() => {
      this.cornerComponent()?.handleResize();
    });
  }

  onScroll() {
    const viewport = this.dataViewportRef()?.nativeElement;
    const headerTop = this.headerTopRef()?.nativeElement;
    const headerLeft = this.headerLeftRef()?.nativeElement;

    if (!viewport || !headerTop || !headerLeft) return;

    if (headerTop.scrollLeft !== viewport.scrollLeft) {
      headerTop.scrollLeft = viewport.scrollLeft;
    }
    if (headerLeft.scrollTop !== viewport.scrollTop) {
      headerLeft.scrollTop = viewport.scrollTop;
    }
  }

  onCellClick(cell: MatrixCell) {
    if (cell.active && cell.service) {
      const fullService = this.registry.services().find(s => s.id === cell.service!.id);

      if (fullService) {
        this.selectService()(fullService);
      } else {
        this.selectService()(cell.service);
      }
    }
  }

  getCellTitle(cell: MatrixCell): string {
    if (cell.isConsumer) return `Used: ${cell.dependency?.propName || 'Unknown'}`;
    if (cell.isProvider) return 'Provider';
    return '';
  }

  private setupZoomHandler() {
    this.wheelListener = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        const delta = Math.sign(event.deltaY) * -1;
        this.ngZone.run(() => {
          const next = this.scale() + (delta * 0.1);
          this.scale.set(Math.max(0.5, Math.min(next, 2.5)));
        });
      }
    };
    this.el.nativeElement.addEventListener('wheel', this.wheelListener, {passive: false});
  }

  private removeZoomHandler() {
    if (this.wheelListener) {
      this.el.nativeElement.removeEventListener('wheel', this.wheelListener);
    }
  }

  private initWorker() {
    if (typeof Worker !== 'undefined' && !this.worker) {

      const workerScript = `

        ${worker_getTypeClass.toString()}
        ${worker_flattenTree.toString()}
        ${worker_calculateMatrix.toString()}

        self.addEventListener('message', ({data}) => {
          if (data.type === 'CALCULATE') {
            try {
              const result = worker_calculateMatrix(data.payload);
              self.postMessage({type: 'RESULT', payload: result});
            } catch (e) {
              console.error('Matrix Worker Error:', e);
            }
          }
        });
      `;

      const blob = new Blob([workerScript], {type: 'application/javascript'});
      this.workerObjUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerObjUrl);

      this.worker.onmessage = ({data}) => {
        if (data.type === 'RESULT') {
          this.ngZone.run(() => {
            this.rows.set(data.payload.rows);
            this.columns.set(data.payload.columns);
            this.isWorkerDone.set(true);
            setTimeout(() => this.onScroll(), 50);
          });
        }
      };
    }
  }

  private calculateData() {
    if (!this.worker) return;

    if (this.rows().length === 0) {
      this.isWorkerDone.set(false);
      this.isAnimationDone.set(false);
    }

    const sanitizeNode = (node: GenieTreeNode): any => ({
      id: node.id,
      label: node.label,
      children: node.children ? node.children.map(c => sanitizeNode(c)) : [],
    });

    const safeServices = this.registry.services().map(s => {
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
        isFramework: s.isFramework
      };
    });

    const safeDependencies = this.registry.dependencies().map(d => ({
      providerId: d.providerId,
      consumerNodeId: d.consumerNodeId,
      propName: d.propName
    }));

    const payload = {
      tree: this.tree().map(n => sanitizeNode(n)),
      filterState: this.filterState(),
      services: safeServices,
      dependencies: safeDependencies
    };

    this.worker.postMessage({type: 'CALCULATE', payload});
  }
}

function worker_calculateMatrix(payload: any) {
  const {tree, filterState, services, dependencies} = payload;

  let allNodes = worker_flattenTree(tree);
  let filteredNodes = allNodes;

  if (filterState && filterState.searchMode === 'component') {
    const tags = filterState.componentTags || [];
    const matchMode = filterState.matchMode || 'OR';
    if (tags.length > 0) {
      filteredNodes = filteredNodes.filter((node: any) => {
        if (matchMode === 'OR') return tags.includes(node.label);
        return tags.every((t: any) => node.label === t);
      });
    }
  }

  const visibleNodeIds = new Set(filteredNodes.map((n: any) => n.id));

  let candidateServices = services.filter((s: any) => {
    const isFramework = s.isFramework;

    if (filterState?.hideInternals && isFramework) return false;

    if (filterState) {
      const type = s.dependencyType;

      if (isFramework) {
        if (type === 'Service' && !filterState.showFrameworkServices) return false;
        if (type === 'System' && !filterState.showFrameworkSystem) return false;
        if (type === 'Pipe' && !filterState.showFrameworkPipes) return false;
        if (type === 'Directive' && !filterState.showFrameworkDirectives) return false;
        if (type === 'Component' && !filterState.showFrameworkComponents) return false;
        if (type === 'Token' && !filterState.showFrameworkTokens) return false;
        if (type === 'Observable' && !filterState.showFrameworkObservables) return false;
      } else {
        if (type === 'Service' && !filterState.showUserServices) return false;
        if (type === 'Pipe' && !filterState.showUserPipes) return false;
        if (type === 'Directive' && !filterState.showUserDirectives) return false;
        if (type === 'Component' && !filterState.showUserComponents) return false;
        if (type === 'Token' && !filterState.showUserTokens) return false;
        if (type === 'Value' && !filterState.showUserValues) return false;
        if (type === 'Observable' && !filterState.showUserObservables) return false;
      }

      const isRoot = s.isRoot === true;
      if (filterState.showRootOnly && !isRoot) return false;
      if (filterState.showLocalOnly && isRoot) return false;

      const isDepSearchMode = filterState.searchMode === 'dependency';
      if (isDepSearchMode && filterState.dependencyTags?.length > 0) {
        const matchMode = filterState.matchMode || 'OR';
        if (matchMode === 'AND') {
          if (!filterState.dependencyTags.every((tag: any) => s.label === tag)) return false;
        } else {
          if (!filterState.dependencyTags.includes(s.label)) return false;
        }
      }
    }
    return true;
  });

  const depMap = new Map();
  const providerMap = new Set();
  const serviceViewUsage = new Map();

  dependencies.forEach((d: any) => {
    if (visibleNodeIds.has(d.consumerNodeId)) {
      const key = d.consumerNodeId + '_' + d.providerId;
      depMap.set(key, d);
      if (d.providerId) serviceViewUsage.set(d.providerId, (serviceViewUsage.get(d.providerId) || 0) + 1);
    }
  });

  services.forEach((s: any) => {
    providerMap.add(s.nodeId + '_' + s.id);
    if (visibleNodeIds.has(s.nodeId)) {
      serviceViewUsage.set(s.id, (serviceViewUsage.get(s.id) || 0) + 1);
    }
  });

  let finalServices = candidateServices;
  if (filterState?.hideUnusedDeps) {
    finalServices = finalServices.filter((s: any) => (serviceViewUsage.get(s.id) || 0) > 0);
  }

  const columns = finalServices.map((service: any) => ({
    id: service.id,
    label: service.label,
    totalCount: serviceViewUsage.get(service.id) || 0,
    service: service,
    typeClass: worker_getTypeClass(service),
    isFramework: service.isFramework
  })).sort((a: any, b: any) => b.totalCount - a.totalCount);

  if (columns.length === 0 && filteredNodes.length === 0) return {rows: [], columns: []};

  const rows = filteredNodes.sort((a: any, b: any) => a.label.localeCompare(b.label)).map((node: any) => {
    const cells = columns.map((col: any, colIdx: number) => {
      const key = node.id + '_' + col.id;
      const dependency = depMap.get(key);
      const isProvider = providerMap.has(key);
      return {
        id: key,
        isConsumer: !!dependency,
        isProvider,
        active: !!dependency || isProvider,
        service: col.service,
        dependency: dependency,
        colIndex: colIdx,
        typeClass: col.typeClass,
        isFramework: col.isFramework
      };
    });
    return {node, cells};
  });

  return {rows, columns};
}

function worker_flattenTree(nodes: any[]): any[] {
  let result: any[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) result = result.concat(worker_flattenTree(node.children));
  }
  return result;
}

function worker_getTypeClass(service: any): string {
  const type = service.dependencyType;
  if (type) {
    switch (type) {
      case 'Component':
        return 'type-component';
      case 'Directive':
        return 'type-directive';
      case 'Pipe':
        return 'type-pipe';
      case 'Service':
        return 'type-service';
      case 'System':
        return 'type-system';
      case 'Value':
        return 'type-value';
      case 'Observable':
        return 'type-observable';
      case 'Token':
        return 'type-token';
      default:
        return 'type-other';
    }
  }
  return 'type-other';
}
