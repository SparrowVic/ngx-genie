import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  NgZone,
  OnDestroy,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core';

import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {GenieResizableDirective} from '../../../../../shared/directives/resizable/resizable.directive';
import {TreeLegendComponent} from './tree-legend/tree-legend.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {OrgChartUtils} from '../org-chart-view/org-chart.utils';
import {GenieExplorerStateService} from '../../../explorer-state.service';
import {GenieToastService} from '../../../../../shared/services/genie-toast.service';

const TREE_ROW_HEIGHT = 34;
const TREE_OVERSCAN_ROWS = 16;
const TREE_FLATTEN_CHUNK_BUDGET_MS = 6;
const TREE_FLATTEN_CHUNK_MAX_ROWS = 750;

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
  imports: [TreeLegendComponent, GenieResizableDirective],
  providers: [GenieResizableDirective],
  templateUrl: './tree-view.component.html',
  styleUrl: './tree-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class TreeViewComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  private readonly state = inject(GenieExplorerStateService);
  private readonly toastService = inject(GenieToastService);

  /** Expand-independent counts of the currently filtered tree (nodes + visible dependency rows). */
  protected readonly filteredStats = this.state.filteredStats;

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
  private readonly flatRowsCache = signal<TreeVirtualRow[]>([]);
  private resizeObserver?: ResizeObserver;
  private flattenRunId = 0;
  private flattenTimer: ReturnType<typeof setTimeout> | null = null;
  private flattenIdleHandle: number | null = null;
  private isDestroyed = false;

  readonly rowHeight = TREE_ROW_HEIGHT;

  readonly flatRows = computed<TreeVirtualRow[]>(() => this.flatRowsCache());

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

  constructor() {
    effect(() => {
      const tree = this.tree();
      const isExpanded = this.isNodeExpanded();
      const getProviders = this.getProvidersForNode();
      this.scheduleFlatRowsRebuild(tree, isExpanded, getProviders);
    });
  }

  ngAfterViewInit(): void {
    this.measureViewport();
    const element = this.scrollContainer()?.nativeElement;
    if (!element || typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => this.measureViewport());
    this.resizeObserver.observe(element);
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.resizeObserver?.disconnect();
    this.cancelFlatRowsRebuild();
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

  /** Copy the currently filtered tree to the clipboard as JSON and toast the outcome. */
  protected copyFilteredJson(): void {
    const json = this.state.exportFilteredTreeAsJson();
    const stats = this.filteredStats();
    void this.writeToClipboard(json).then(ok => {
      if (ok) {
        this.toastService.success(`Copied ${stats.nodes} nodes · ${stats.dependencies} deps to clipboard as JSON`);
      } else {
        this.toastService.error('Could not access the clipboard');
      }
    });
  }

  private async writeToClipboard(text: string): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to the legacy execCommand path
    }
    try {
      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  private measureViewport(): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    this.viewportHeight.set(element.clientHeight || 600);
  }

  private scheduleFlatRowsRebuild(
    tree: GenieTreeNode[],
    isExpanded: (id: number) => boolean,
    getProviders: (node: GenieTreeNode) => GenieServiceRegistration[]
  ): void {
    const runId = ++this.flattenRunId;
    this.cancelFlatRowsRebuild();

    if (tree.length === 0) {
      this.flatRowsCache.set([]);
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.scheduleFlatRowsChunk(() => this.buildFlatRowsChunked(tree, isExpanded, getProviders, runId));
    });
  }

  private buildFlatRowsChunked(
    tree: GenieTreeNode[],
    isExpanded: (id: number) => boolean,
    getProviders: (node: GenieTreeNode) => GenieServiceRegistration[],
    runId: number
  ): void {
    const rows: TreeVirtualRow[] = [];
    const stack: Array<{ kind: 'node'; node: GenieTreeNode; depth: number } | TreeDependencyRow> = [];

    for (let index = tree.length - 1; index >= 0; index--) {
      stack.push({kind: 'node', node: tree[index], depth: 0});
    }

    const processChunk = () => {
      if (this.isDestroyed || runId !== this.flattenRunId) return;

      const startedAt = this.now();
      let processedRows = 0;

      while (
        stack.length > 0
        && processedRows < TREE_FLATTEN_CHUNK_MAX_ROWS
        && this.now() - startedAt < TREE_FLATTEN_CHUNK_BUDGET_MS
      ) {
        const item = stack.pop()!;

        if (item.kind === 'dependency') {
          rows.push(item);
          processedRows++;
          continue;
        }

        const node = item.node;
        const dependencies = getProviders(node);
        const expanded = isExpanded(node.id);
        const hasChildren = (node.children?.length || 0) > 0;
        const hasDependencies = dependencies.length > 0;

        rows.push({
          kind: 'node',
          id: `node:${node.id}`,
          node,
          depth: item.depth,
          expanded,
          hasExpandableContent: hasChildren || hasDependencies,
          dependencyCount: dependencies.length
        });
        processedRows++;

        if (!expanded) continue;

        if (hasChildren) {
          for (let childIndex = node.children!.length - 1; childIndex >= 0; childIndex--) {
            stack.push({kind: 'node', node: node.children![childIndex], depth: item.depth + 1});
          }
        }

        for (let depIndex = dependencies.length - 1; depIndex >= 0; depIndex--) {
          const dependency = dependencies[depIndex];
          stack.push({
            kind: 'dependency',
            id: `dep:${node.id}:${dependency.id}`,
            dependency,
            depth: item.depth + 1
          });
        }
      }

      if (stack.length > 0) {
        this.scheduleFlatRowsChunk(processChunk);
        return;
      }

      if (runId !== this.flattenRunId || this.isDestroyed) return;
      this.zone.run(() => this.flatRowsCache.set(rows));
    };

    processChunk();
  }

  private scheduleFlatRowsChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      this.flattenIdleHandle = win.requestIdleCallback(callback, {timeout: 100});
      return;
    }

    this.flattenTimer = setTimeout(callback, 0);
  }

  private cancelFlatRowsRebuild(): void {
    if (this.flattenTimer) {
      clearTimeout(this.flattenTimer);
      this.flattenTimer = null;
    }

    const win = typeof window !== 'undefined' ? window as any : null;
    if (this.flattenIdleHandle !== null && win && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(this.flattenIdleHandle);
    }
    this.flattenIdleHandle = null;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
