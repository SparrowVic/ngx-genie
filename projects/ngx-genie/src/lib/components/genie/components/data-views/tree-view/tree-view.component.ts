import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  OnDestroy,
  signal,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';

import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {GenieResizableDirective} from '../../../../../shared/directives/resizable/resizable.directive';
import {TreeLegendComponent} from './tree-legend/tree-legend.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {OrgChartUtils} from '../org-chart-view/org-chart.utils';

const TREE_ROW_HEIGHT = 34;
const TREE_OVERSCAN_ROWS = 16;

interface TreeNodeRow {
  kind: 'node';
  id: string;
  node: GenieTreeNode;
  depth: number;
  expanded: boolean;
  hasExpandableContent: boolean;
  dependencyCount: number;
}

interface TreeDependencyRow {
  kind: 'dependency';
  id: string;
  dependency: GenieServiceRegistration;
  depth: number;
}

type TreeVirtualRow = TreeNodeRow | TreeDependencyRow;

interface VisibleTreeRow {
  row: TreeVirtualRow;
  top: number;
}

@Component({
  selector: 'lib-tree-view',
  standalone: true,
  imports: [TreeLegendComponent, GenieResizableDirective],
  providers: [GenieResizableDirective],
  templateUrl: './tree-view.component.html',
  styleUrl: './tree-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class TreeViewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLElement>;

  readonly tree = input.required<GenieTreeNode[]>();
  readonly filterState = input<GenieFilterState | null>(null);
  readonly isNodeExpanded = input.required<(id: number) => boolean>();
  readonly toggleNode = input.required<(id: number) => void>();
  readonly selectNode = input.required<(node: GenieTreeNode) => void>();
  readonly selectDependency = input.required<(dep: GenieServiceRegistration) => void>();
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectedNode = input<GenieTreeNode | null>(null);
  readonly selectedDependency = input<GenieServiceRegistration | null>(null);

  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(600);
  private resizeObserver?: ResizeObserver;

  readonly rowHeight = TREE_ROW_HEIGHT;

  readonly flatRows = computed<TreeVirtualRow[]>(() => {
    const rows: TreeVirtualRow[] = [];
    const isExpanded = this.isNodeExpanded();
    const getProviders = this.getProvidersForNode();

    const walk = (nodes: GenieTreeNode[], depth: number) => {
      for (const node of nodes) {
        const dependencies = getProviders(node);
        const expanded = isExpanded(node.id);
        const hasChildren = (node.children?.length || 0) > 0;
        const hasDependencies = dependencies.length > 0;

        rows.push({
          kind: 'node',
          id: `node:${node.id}`,
          node,
          depth,
          expanded,
          hasExpandableContent: hasChildren || hasDependencies,
          dependencyCount: dependencies.length
        });

        if (!expanded) continue;

        for (const dependency of dependencies) {
          rows.push({
            kind: 'dependency',
            id: `dep:${node.id}:${dependency.id}`,
            dependency,
            depth: depth + 1
          });
        }

        if (hasChildren) {
          walk(node.children, depth + 1);
        }
      }
    };

    walk(this.tree(), 0);
    return rows;
  });

  readonly totalHeight = computed(() => this.flatRows().length * TREE_ROW_HEIGHT);

  readonly visibleRows = computed<VisibleTreeRow[]>(() => {
    const rows = this.flatRows();
    const startIndex = Math.max(0, Math.floor(this.scrollTop() / TREE_ROW_HEIGHT) - TREE_OVERSCAN_ROWS);
    const visibleCount = Math.ceil(this.viewportHeight() / TREE_ROW_HEIGHT) + TREE_OVERSCAN_ROWS * 2;
    const endIndex = Math.min(rows.length, startIndex + visibleCount);

    const visible: VisibleTreeRow[] = [];
    for (let index = startIndex; index < endIndex; index++) {
      visible.push({
        row: rows[index],
        top: index * TREE_ROW_HEIGHT
      });
    }
    return visible;
  });

  protected readonly _selectedNodeId = computed(() => this.selectedNode()?.id ?? null);
  protected readonly _selectedDependencyId = computed(() => this.selectedDependency()?.id ?? null);

  ngAfterViewInit(): void {
    this.measureViewport();
    const element = this.scrollContainer?.nativeElement;
    if (!element || typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => this.measureViewport());
    this.resizeObserver.observe(element);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected onScroll(event: Event): void {
    this.scrollTop.set((event.target as HTMLElement).scrollTop);
  }

  protected trackVisibleRow(_: number, item: VisibleTreeRow): string {
    return item.row.id;
  }

  protected toggleRow(row: TreeNodeRow, event: MouseEvent): void {
    event.stopPropagation();
    if (!row.hasExpandableContent) return;
    this.toggleNode()(row.node.id);
  }

  protected selectNodeRow(row: TreeNodeRow): void {
    this.selectNode()(row.node);
  }

  protected selectDependencyRow(row: TreeDependencyRow, event: MouseEvent): void {
    event.stopPropagation();
    this.selectDependency()(row.dependency);
  }

  protected nodeIndent(depth: number): number {
    return 12 + depth * 18;
  }

  protected dependencyIndent(depth: number): number {
    return 38 + depth * 18;
  }

  protected isRoot(svc: GenieServiceRegistration): boolean {
    return OrgChartUtils.isRoot(svc);
  }

  protected getAbbrType(type: string): string {
    return OrgChartUtils.getAbbrType(type);
  }

  protected getProviderTypeAbbr(type: string): string {
    return type ? type.substring(0, 3).toUpperCase() : 'UNK';
  }

  private measureViewport(): void {
    const element = this.scrollContainer?.nativeElement;
    if (!element) return;
    this.viewportHeight.set(element.clientHeight || 600);
  }
}
