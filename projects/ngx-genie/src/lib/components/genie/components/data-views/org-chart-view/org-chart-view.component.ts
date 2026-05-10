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
import {CommonModule} from '@angular/common';
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
const ORG_SUMMARY_COUNT_CAP = 9999;

interface OrgRenderBudget {
  remaining: number;
  nextSummaryId: number;
}

interface OrgNodeServiceSlice {
  visible: GenieServiceRegistration[];
  hiddenCount: number;
}

@Component({
  selector: 'lib-org-chart-view',
  standalone: true,
  imports: [
    CommonModule,
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

  readonly totalVisibleNodes = computed(() => this.countVisibleNodes(this.tree(), this.renderLimit() + 1));
  readonly isLargeGraph = computed(() => this.totalVisibleNodes() > this.renderLimit());

  readonly renderedTree = computed(() => {
    const tree = this.tree();
    if (!this.isLargeGraph()) return tree;

    return this.limitTreeForRender(tree, 0, null, {
      remaining: this.renderLimit(),
      nextSummaryId: -1
    });
  });

  readonly serviceSlicesByNodeId = computed(() => {
    const getProviders = this.getProvidersForNode();
    const slices = new Map<number, OrgNodeServiceSlice>();
    const walk = (nodes: GenieTreeNode[]) => {
      for (const node of nodes) {
        if (!this.isSummaryNode(node)) {
          const services = getProviders(node);
          slices.set(node.id, {
            visible: services.slice(0, ORG_MAX_SERVICES_PER_NODE),
            hiddenCount: Math.max(0, services.length - ORG_MAX_SERVICES_PER_NODE)
          });
        }
        if (node.children?.length) walk(node.children);
      }
    };

    walk(this.renderedTree());
    return slices;
  });

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

  getVisibleServices(node: GenieTreeNode): GenieServiceRegistration[] {
    return this.serviceSlicesByNodeId().get(node.id)?.visible ?? [];
  }

  getHiddenServiceCount(node: GenieTreeNode): number {
    return this.serviceSlicesByNodeId().get(node.id)?.hiddenCount ?? 0;
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

  private countVisibleNodes(nodes: GenieTreeNode[], limit = Number.POSITIVE_INFINITY): number {
    const isExpanded = this.isNodeExpanded();
    let count = 0;
    const stack = [...nodes].reverse();

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
    budget: OrgRenderBudget
  ): GenieTreeNode[] {
    const result: GenieTreeNode[] = [];
    let omittedCount = 0;
    const isExpanded = this.isNodeExpanded();
    const addOmittedCount = (omittedNodes: GenieTreeNode[]) => {
      if (omittedCount >= ORG_SUMMARY_COUNT_CAP) return;
      omittedCount += this.countVisibleNodes(omittedNodes, ORG_SUMMARY_COUNT_CAP - omittedCount);
    };

    for (const node of nodes) {
      if (budget.remaining <= 0) {
        addOmittedCount([node]);
        continue;
      }

      budget.remaining--;
      let children: GenieTreeNode[] = [];

      if (isExpanded(node.id) && node.children?.length) {
        if (depth >= this.renderDepthLimit()) {
          addOmittedCount(node.children);
        } else {
          children = this.limitTreeForRender(node.children, depth + 1, node, budget);
        }
      }

      result.push({...node, children});
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
