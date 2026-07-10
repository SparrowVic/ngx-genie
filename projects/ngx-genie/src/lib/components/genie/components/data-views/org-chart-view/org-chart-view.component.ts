import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  ViewEncapsulation
} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {OrgChartLegendComponent} from './org-chart-legend/org-chart-legend.component';
import {OrgChartNodeComponent} from './org-chart-node/org-chart-node.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {OrgChartStateService} from './org-chart-state.service';

const ORG_INITIAL_RENDERED_NODES = 450;
const ORG_RENDER_STEP = 1000;
const ORG_INITIAL_MAX_DEPTH = 6;
const ORG_DEPTH_STEP = 3;
const ORG_MAX_SERVICES_PER_NODE = 8;
const ORG_MAX_SERVICES_PER_LARGE_NODE = 4;
const ORG_SUMMARY_COUNT_CAP = 9999;
const EMPTY_SERVICE_SLICE: OrgNodeServiceSlice = {visible: [], hiddenCount: 0};

interface OrgRenderBudget {
  remaining: number;
  nextSummaryId: number;
}

interface OrgNodeServiceSlice {
  visible: GenieServiceRegistration[];
  hiddenCount: number;
}

interface OrgNodeServiceSliceCacheEntry {
  source: readonly GenieServiceRegistration[];
  slice: OrgNodeServiceSlice;
}

interface OrgVisibleNodeScan {
  count: number;
  nodes: GenieTreeNode[];
}

interface OrgRenderSnapshot {
  tree: GenieTreeNode[];
  visibleNodes: GenieTreeNode[];
  totalVisibleNodes: number;
  isLargeGraph: boolean;
}

@Component({
  selector: 'lib-org-chart-view',
  imports: [
    NgTemplateOutlet,
    OrgChartLegendComponent,
    OrgChartNodeComponent
  ],
  templateUrl: './org-chart-view.component.html',
  styleUrl: './org-chart-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OrgChartViewComponent implements OnInit, OnDestroy {
  private stateService = inject(OrgChartStateService);
  private serviceSliceCache = new Map<number, OrgNodeServiceSliceCacheEntry>();

  readonly tree = input.required<GenieTreeNode[]>();
  readonly filterState = input<GenieFilterState | null>(null);
  readonly transformStyle = input<string>('');
  readonly isNodeExpanded = input.required<(id: number) => boolean>();
  readonly toggleNode = input.required<(id: number) => void>();
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectService = input.required<(svc: GenieServiceRegistration) => void>();
  readonly selectNode = input.required<(node: GenieTreeNode) => void>();

  viewState = {x: 0, y: 0, k: 1};
  isDragging = false;
  lastMousePos = {x: 0, y: 0};
  private readonly renderLimit = signal(ORG_INITIAL_RENDERED_NODES);
  private readonly renderDepthLimit = signal(ORG_INITIAL_MAX_DEPTH);

  private readonly renderSnapshot = computed<OrgRenderSnapshot>(() => {
    const tree = this.tree();
    const renderLimit = this.renderLimit();
    const depthLimit = this.renderDepthLimit();
    const isExpanded = this.isNodeExpanded();
    const visibleScan = this.scanVisibleNodes(tree, renderLimit + 1, isExpanded);
    const isLargeGraph = visibleScan.count > renderLimit;

    if (!isLargeGraph) {
      return {
        tree,
        visibleNodes: visibleScan.nodes,
        totalVisibleNodes: visibleScan.count,
        isLargeGraph: false
      };
    }

    const renderedNodes: GenieTreeNode[] = [];
    const renderedTree = this.limitTreeForRender(tree, 0, null, {
      remaining: renderLimit,
      nextSummaryId: -1
    }, renderedNodes, isExpanded, depthLimit);

    return {
      tree: renderedTree,
      visibleNodes: renderedNodes,
      totalVisibleNodes: visibleScan.count,
      isLargeGraph: true
    };
  });

  readonly totalVisibleNodes = computed(() => this.renderSnapshot().totalVisibleNodes);
  readonly isLargeGraph = computed(() => this.renderSnapshot().isLargeGraph);
  readonly renderedTree = computed(() => this.renderSnapshot().tree);

  readonly serviceSlicesByNodeId = computed(() => {
    const getProviders = this.getProvidersForNode();
    const snapshot = this.renderSnapshot();
    const serviceLimit = snapshot.isLargeGraph ? ORG_MAX_SERVICES_PER_LARGE_NODE : ORG_MAX_SERVICES_PER_NODE;
    const slices = new Map<number, OrgNodeServiceSlice>();
    const nextCache = new Map<number, OrgNodeServiceSliceCacheEntry>();

    for (const node of snapshot.visibleNodes) {
      if (this.isSummaryNode(node)) continue;

      const services = getProviders(node);
      const cached = this.serviceSliceCache.get(node.id);
      const targetVisibleCount = Math.min(services.length, serviceLimit);
      const slice = cached?.source === services && cached.slice.visible.length >= targetVisibleCount
        ? this.reuseOrTrimServiceSlice(cached.slice, services.length, serviceLimit)
        : this.createServiceSlice(services, serviceLimit);

      slices.set(node.id, slice);
      nextCache.set(node.id, {source: services, slice});
    }

    this.serviceSliceCache = nextCache;
    return slices;
  });

  getServiceSlice(node: GenieTreeNode): OrgNodeServiceSlice {
    return this.serviceSlicesByNodeId().get(node.id) ?? EMPTY_SERVICE_SLICE;
  }

  ngOnInit() {
    if (this.stateService.hasTransform()) {
      this.viewState = {...this.stateService.viewTransform};
    }
  }

  ngOnDestroy() {
    this.stateService.saveViewTransform(this.viewState);
  }

  get currentTransform(): string {
    return `translate(${this.viewState.x}px, ${this.viewState.y}px) scale(${this.viewState.k})`;
  }


  onMouseDown(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('lib-org-chart-node, button')) return;

    event.stopPropagation();
    this.isDragging = true;
    this.lastMousePos = {x: event.clientX, y: event.clientY};
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;
    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - this.lastMousePos.x;
    const dy = event.clientY - this.lastMousePos.y;

    this.viewState.x += dx;
    this.viewState.y += dy;
    this.lastMousePos = {x: event.clientX, y: event.clientY};
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();

    const zoomIntensity = 0.1;
    const delta = event.deltaY < 0 ? 1 : -1;
    const factor = Math.exp(delta * zoomIntensity);

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const newK = Math.max(0.1, Math.min(5, this.viewState.k * factor));
    const kRatio = newK / this.viewState.k;

    this.viewState.x = mouseX - (mouseX - this.viewState.x) * kRatio;
    this.viewState.y = mouseY - (mouseY - this.viewState.y) * kRatio;
    this.viewState.k = newK;
  }

  onNodeClick(node: GenieTreeNode): void {
    if (this.isSummaryNode(node)) {
      this.revealMoreNodes();
      return;
    }
    this.selectNode()(node);
  }

  onToggleNode(node: GenieTreeNode): void {
    if (this.isSummaryNode(node)) {
      this.revealMoreNodes();
      return;
    }
    this.toggleNode()(node.id);
  }

  private scanVisibleNodes(
    nodes: GenieTreeNode[],
    limit: number,
    isExpanded: (id: number) => boolean
  ): OrgVisibleNodeScan {
    let count = 0;
    const visibleNodes: GenieTreeNode[] = [];
    const stack = [...nodes].reverse();

    while (stack.length > 0 && count < limit) {
      const node = stack.pop()!;
      count++;
      visibleNodes.push(node);

      if (isExpanded(node.id) && node.children?.length) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return {count, nodes: visibleNodes};
  }

  private createServiceSlice(
    services: readonly GenieServiceRegistration[],
    limit: number
  ): OrgNodeServiceSlice {
    return {
      visible: services.slice(0, limit),
      hiddenCount: Math.max(0, services.length - limit)
    };
  }

  private reuseOrTrimServiceSlice(
    slice: OrgNodeServiceSlice,
    totalServices: number,
    limit: number
  ): OrgNodeServiceSlice {
    if (slice.visible.length === Math.min(totalServices, limit)) return slice;

    return {
      visible: slice.visible.slice(0, limit),
      hiddenCount: Math.max(0, totalServices - limit)
    };
  }

  private countVisibleNodes(
    nodes: GenieTreeNode[],
    limit = Number.POSITIVE_INFINITY,
    isExpanded = this.isNodeExpanded(),
    startIndex = 0
  ): number {
    let count = 0;
    const stack: GenieTreeNode[] = [];
    for (let index = nodes.length - 1; index >= startIndex; index--) {
      stack.push(nodes[index]);
    }

    while (stack.length > 0 && count < limit) {
      const node = stack.pop()!;
      count++;
      if (isExpanded(node.id) && node.children?.length) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return count;
  }

  private limitTreeForRender(
    nodes: GenieTreeNode[],
    depth: number,
    parent: GenieTreeNode | null,
    budget: OrgRenderBudget,
    renderedNodes: GenieTreeNode[],
    isExpanded: (id: number) => boolean,
    depthLimit: number
  ): GenieTreeNode[] {
    const result: GenieTreeNode[] = [];
    let omittedCount = 0;
    const addOmittedCount = (omittedNodes: GenieTreeNode[], startIndex = 0) => {
      if (omittedCount >= ORG_SUMMARY_COUNT_CAP) return;
      omittedCount += this.countVisibleNodes(
        omittedNodes,
        ORG_SUMMARY_COUNT_CAP - omittedCount,
        isExpanded,
        startIndex
      );
    };

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];

      if (budget.remaining <= 0) {
        addOmittedCount(nodes, index);
        break;
      }

      budget.remaining--;
      let children: GenieTreeNode[] = [];

      if (isExpanded(node.id) && node.children?.length) {
        if (depth >= depthLimit) {
          addOmittedCount(node.children);
        } else {
          children = this.limitTreeForRender(
            node.children,
            depth + 1,
            node,
            budget,
            renderedNodes,
            isExpanded,
            depthLimit
          );
        }
      }

      const renderedNode = {...node, children};
      renderedNodes.push(renderedNode);
      result.push(renderedNode);
    }

    if (omittedCount > 0) {
      result.push(this.createSummaryNode(parent, nodes[0], omittedCount, budget));
    }

    return result;
  }

  private createSummaryNode(
    parent: GenieTreeNode | null,
    anchor: GenieTreeNode,
    omittedCount: number,
    budget: OrgRenderBudget
  ): GenieTreeNode {
    return {
      id: budget.nextSummaryId--,
      label: `Show ${omittedCount}${omittedCount >= ORG_SUMMARY_COUNT_CAP ? '+' : ''} more nodes`,
      injector: anchor.injector,
      type: anchor.type,
      parentId: parent?.id ?? null,
      componentInstance: undefined,
      isActive: false,
      children: [],
      groupCount: omittedCount
    };
  }

  private isSummaryNode(node: GenieTreeNode): boolean {
    return node.id < 0 && (node.groupCount || 0) > 0;
  }

  private revealMoreNodes(): void {
    this.renderLimit.update(limit => Math.max(limit + ORG_RENDER_STEP, Math.ceil(limit * 1.75)));
    this.renderDepthLimit.update(depth => depth + ORG_DEPTH_STEP);
  }
}
