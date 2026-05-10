import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  ViewEncapsulation
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {OrgChartLegendComponent} from './org-chart-legend/org-chart-legend.component';
import {OrgChartNodeComponent} from './org-chart-node/org-chart-node.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {OrgChartStateService} from './org-chart-state.service';

const ORG_MAX_RENDERED_NODES = 450;
const ORG_MAX_DEPTH = 6;
const ORG_MAX_SERVICES_PER_NODE = 8;

interface OrgRenderBudget {
  remaining: number;
  nextSummaryId: number;
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

  readonly totalVisibleNodes = computed(() => this.countVisibleNodes(this.tree(), 0));
  readonly isLargeGraph = computed(() => this.totalVisibleNodes() > ORG_MAX_RENDERED_NODES);

  readonly renderedTree = computed(() => {
    const tree = this.tree();
    if (!this.isLargeGraph()) return tree;

    return this.limitTreeForRender(tree, 0, null, {
      remaining: ORG_MAX_RENDERED_NODES,
      nextSummaryId: -1
    });
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
    if (this.isSummaryNode(node)) return [];
    return this.getProvidersForNode()(node).slice(0, ORG_MAX_SERVICES_PER_NODE);
  }

  getHiddenServiceCount(node: GenieTreeNode): number {
    if (this.isSummaryNode(node)) return 0;
    const total = this.getProvidersForNode()(node).length;
    return Math.max(0, total - ORG_MAX_SERVICES_PER_NODE);
  }

  onNodeClick(node: GenieTreeNode): void {
    if (this.isSummaryNode(node)) return;
    this.selectNode()(node);
  }

  onToggleNode(node: GenieTreeNode): void {
    if (this.isSummaryNode(node)) return;
    this.toggleNode()(node.id);
  }

  private countVisibleNodes(nodes: GenieTreeNode[], depth: number): number {
    const isExpanded = this.isNodeExpanded();
    let count = 0;

    for (const node of nodes) {
      count++;
      if (isExpanded(node.id) && node.children?.length) {
        count += this.countVisibleNodes(node.children, depth + 1);
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

    for (const node of nodes) {
      if (budget.remaining <= 0) {
        omittedCount += this.countVisibleNodes([node], depth);
        continue;
      }

      budget.remaining--;
      let children: GenieTreeNode[] = [];

      if (isExpanded(node.id) && node.children?.length) {
        if (depth >= ORG_MAX_DEPTH) {
          omittedCount += this.countVisibleNodes(node.children, depth + 1);
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
      label: `${omittedCount} more nodes`,
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
}
