import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  viewChild,
  signal, effect, untracked, ViewEncapsulation, PLATFORM_ID
} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';

import {GenieServiceRegistration, GenieTreeNode} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {ConstellationModeSwitchComponent} from './constellation-mode-switch/constellation-mode-switch.component';
import {ConstellationControlsComponent} from './constellation-controls/constellation-controls.component';
import {ConstellationLegendComponent} from './constellation-legend/constellation-legend.component';
import {ConstellationTooltipComponent} from './constellation-tooltip/constellation-tooltip.component';
import {
  ConstellationGraphStats,
  ConstellationLayoutStrategy,
  ConstellationLinkRenderMode,
  RenderNode
} from './constellation.models';
import {ConstellationEngine} from './constellation.engine';
import {ConstellationMapper} from './constellation.mapper';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {ConstellationStateService} from './constellation-state.service';

const STORAGE_KEY_CONSTELLATION_MODE = 'genie_constellation_show_component_tree';
const STORAGE_KEY_CONSTELLATION_LINK_MODE = 'genie_constellation_link_render_mode';
const STORAGE_KEY_CONSTELLATION_LAYOUT_STRATEGY = 'genie_constellation_layout_strategy';
const STORAGE_KEY_CONSTELLATION_AUTO_OPTIMIZE = 'genie_constellation_auto_optimize';
const LARGE_GRAPH_HOVER_THROTTLE_MS = 48;
const LARGE_GRAPH_HOVER_NODE_THRESHOLD = 1500;

@Component({
  selector: 'lib-constellation-view',
  standalone: true,
  imports: [
    ConstellationModeSwitchComponent,
    ConstellationControlsComponent,
    ConstellationLegendComponent,
    ConstellationTooltipComponent
],
  templateUrl: './constellation-view.component.html',
  styleUrl: './constellation-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class ConstellationViewComponent implements OnDestroy, AfterViewInit {
  private registry = inject(GenieRegistryService);
  private ngZone = inject(NgZone);
  private stateService = inject(ConstellationStateService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  readonly tree = input<GenieTreeNode[]>([]);
  readonly filterState = input<GenieFilterState | null>(null);
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectService = input.required<(svc: GenieServiceRegistration) => void>();
  readonly transformStyle = input<string>('');

  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

  readonly hoveredNode = signal<RenderNode | null>(null);
  readonly pinnedNode = signal<RenderNode | null>(null);
  readonly graphStats = signal<ConstellationGraphStats | null>(null);

  readonly isPaused = signal(false);
  readonly showComponentTree = signal(this.loadComponentTreeState());
  readonly animationsEnabled = signal(true);
  readonly repulsionValue = signal(400);
  readonly focusModeEnabled = signal(true);
  readonly showControlsPanel = signal(true);
  readonly linkRenderMode = signal<ConstellationLinkRenderMode>(this.loadLinkRenderMode());
  readonly layoutStrategy = signal<ConstellationLayoutStrategy>(this.loadLayoutStrategy());
  readonly autoOptimizeEnabled = signal(this.loadAutoOptimizeState());

  readonly tooltipPos = signal({x: 0, y: 0});

  private engine: ConstellationEngine | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private viewState = {x: 0, y: 0, k: 1};
  private isDragging = false;
  private lastMousePos = {x: 0, y: 0};
  private hasMoved = false;
  private lastHoverHitTestAt = 0;
  private readonly wheelListener = (event: WheelEvent) => this.onWheel(event);
  private graphUpdateRunId = 0;
  private graphUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private graphUpdateIdleHandle: number | null = null;

  constructor() {
    effect(() => {
      this.tree();
      this.filterState();
      this.showComponentTree();
      this.layoutStrategy();

      untracked(() => {
        if (this.engine) {
          this.scheduleGraphDataUpdate();
        }
      });
    });

    effect(() => {
      const showTree = this.showComponentTree();
      this.saveComponentTreeState(showTree);
    });

    effect(() => {
      const mode = this.linkRenderMode();
      this.saveLinkRenderMode(mode);
      untracked(() => this.engine?.setLinkRenderMode(mode));
    });

    effect(() => {
      const strategy = this.layoutStrategy();
      this.saveLayoutStrategy(strategy);
    });

    effect(() => {
      const enabled = this.autoOptimizeEnabled();
      this.saveAutoOptimizeState(enabled);
      if (enabled) {
        untracked(() => {
          const stats = this.graphStats();
          if (stats) this.applyAutoOptimizer(stats);
        });
      }
    });
  }

  ngAfterViewInit() {
    this.initEngine();
    this.initResizeObserver();

    this.canvasRef().nativeElement.addEventListener('wheel', this.wheelListener, {passive: false});
  }

  ngOnDestroy(): void {
    if (this.engine) {
      this.stateService.savePositions(this.engine.getRenderNodes());
      this.stateService.saveViewTransform(this.viewState);
      this.engine.destroy();
    }
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.cancelGraphDataUpdate();
    this.canvasRef().nativeElement.removeEventListener('wheel', this.wheelListener);
  }


  onMouseDown(event: MouseEvent) {
    event.stopPropagation();

    this.isDragging = true;
    this.hasMoved = false;
    this.lastMousePos = {x: event.clientX, y: event.clientY};
    this.canvasRef().nativeElement.style.cursor = 'grabbing';
  }

  onMouseMove(event: MouseEvent) {
    if (this.isDragging) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.hasMoved = true;
      }

      this.viewState.x += dx;
      this.viewState.y += dy;
      this.lastMousePos = {x: event.clientX, y: event.clientY};

      this.engine?.updateTransform(this.viewState);
    } else {

      this.handleHover(event);
    }
  }

  onMouseUp(event: Event) {
    this.isDragging = false;
    this.canvasRef().nativeElement.style.cursor = 'default';

    if (!this.hasMoved) {
      this.handleClick(event as MouseEvent);
    }
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();

    const zoomIntensity = 0.1;
    const delta = event.deltaY < 0 ? 1 : -1;
    const factor = Math.exp(delta * zoomIntensity);

    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const newK = Math.max(0.1, Math.min(5, this.viewState.k * factor));
    const kRatio = newK / this.viewState.k;

    this.viewState.x = mouseX - (mouseX - this.viewState.x) * kRatio;
    this.viewState.y = mouseY - (mouseY - this.viewState.y) * kRatio;
    this.viewState.k = newK;

    this.engine?.updateTransform(this.viewState);
  }

  onMouseLeave() {
    this.isDragging = false;
    this.ngZone.run(() => {
      this.hoveredNode.set(null);
      if (this.engine) {
        this.engine.setHoveredNode(null);
      }
    });
  }

  private handleClick(event: MouseEvent) {
    if (!this.engine) return;
    const rect = this.containerRef().nativeElement.getBoundingClientRect();
    const node = this.engine.getHitNode(event.clientX, event.clientY, rect);

    if (node) {
      this.ngZone.run(() => {
        this.pinnedNode.set(node);
        this.engine?.setPinnedNode(node);
        if (node.type === 'service') this.selectService()(node.data);
      });
    } else {
      this.ngZone.run(() => {
        this.pinnedNode.set(null);
        this.engine?.setPinnedNode(null);
      });
    }
  }

  private handleHover(event: MouseEvent) {
    if (!this.engine) return;
    const now = performance.now();
    if (
      this.engine.getRenderNodes().size > LARGE_GRAPH_HOVER_NODE_THRESHOLD
      && now - this.lastHoverHitTestAt < LARGE_GRAPH_HOVER_THROTTLE_MS
    ) {
      return;
    }
    this.lastHoverHitTestAt = now;

    const rect = this.containerRef().nativeElement.getBoundingClientRect();
    const node = this.engine.getHitNode(event.clientX, event.clientY, rect);
    const prevHover = this.hoveredNode();

    if (prevHover !== node) {
      this.ngZone.run(() => {
        this.hoveredNode.set(node);
        this.engine?.setHoveredNode(node);
        if (node) this._updateTooltipPosition(event, rect);
      });
      this.canvasRef().nativeElement.style.cursor = node && node.type === 'service' ? 'pointer' : 'default';
    } else if (node) {
      this.ngZone.run(() => this._updateTooltipPosition(event, rect));
    }
  }

  toggleComponentTree() {
    this.showComponentTree.update(v => !v);
  }

  togglePause() {
    this.isPaused.update(v => !v);
    if (this.engine) this.engine.isPaused = this.isPaused();
    this.engine?.requestRender();
  }

  toggleAnimations() {
    this.animationsEnabled.update(v => !v);
    if (this.engine) this.engine.animationsEnabled = this.animationsEnabled();
    this.engine?.requestRender();
  }

  toggleFocusMode() {
    this.focusModeEnabled.update(v => !v);
    if (this.engine) this.engine.focusModeEnabled = this.focusModeEnabled();
    this.engine?.requestRender();
  }

  toggleControlsPanel() {
    this.showControlsPanel.update(v => !v);
  }

  updateLinkRenderMode(mode: ConstellationLinkRenderMode) {
    this.linkRenderMode.set(mode);
    if (mode === 'all') {
      this.autoOptimizeEnabled.set(false);
    }
    this.engine?.setLinkRenderMode(mode);
  }

  updateLayoutStrategy(strategy: ConstellationLayoutStrategy) {
    this.layoutStrategy.set(strategy);
    this.scheduleGraphDataUpdate();
  }

  toggleAutoOptimize() {
    this.autoOptimizeEnabled.update(v => !v);
    if (!this.autoOptimizeEnabled()) return;
    const stats = this.graphStats();
    if (stats) this.applyAutoOptimizer(stats);
  }

  clearPinnedNode() {
    this.pinnedNode.set(null);
    this.engine?.setPinnedNode(null);
  }

  resetLayout() {
    if (this.engine) this.engine.resetEntropy();
  }

  updateRepulsion(val: number) {
    this.repulsionValue.set(val);
    if (this.engine) this.engine.updatePhysics(val);
  }

  private initEngine() {
    this.engine = new ConstellationEngine(
      this.canvasRef().nativeElement,
      this.ngZone,
      (positions) => this.engine?.updatePositions(positions)
    );
    this.engine.setLinkRenderMode(this.linkRenderMode());
    this.engine.start();

    if (this.stateService.hasTransform()) {
      this.viewState = this.stateService.viewTransform;
      this.engine.updateTransform(this.viewState);
    }

    this.updateGraphData();
  }

  private initResizeObserver() {
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      const {width, height} = entry.contentRect;
      this.engine?.resize(width, height, window.devicePixelRatio || 1);
      this.scheduleGraphDataUpdate(width, height);
    });
    this.resizeObserver.observe(this.containerRef().nativeElement);
  }

  private scheduleGraphDataUpdate(forcedWidth?: number, forcedHeight?: number): void {
    const runId = ++this.graphUpdateRunId;
    this.cancelGraphDataUpdate();

    const callback = () => {
      if (runId !== this.graphUpdateRunId) return;
      this.updateGraphData(forcedWidth, forcedHeight);
    };

    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      this.graphUpdateIdleHandle = win.requestIdleCallback(callback, {timeout: 160});
      return;
    }

    this.graphUpdateTimer = setTimeout(callback, 80);
  }

  private cancelGraphDataUpdate(): void {
    if (this.graphUpdateTimer) {
      clearTimeout(this.graphUpdateTimer);
      this.graphUpdateTimer = null;
    }

    const win = typeof window !== 'undefined' ? window as any : null;
    if (
      this.graphUpdateIdleHandle !== null
      && win
      && typeof win.cancelIdleCallback === 'function'
    ) {
      win.cancelIdleCallback(this.graphUpdateIdleHandle);
    }
    this.graphUpdateIdleHandle = null;
  }

  private updateGraphData(forcedWidth?: number, forcedHeight?: number) {
    if (!this.engine) return;

    let width = forcedWidth;
    let height = forcedHeight;

    if (!width || !height) {
      const rect = this.containerRef().nativeElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }

    const engineNodes = this.engine.getRenderNodes();
    const positionsSource = (engineNodes.size > 0)
      ? engineNodes
      : this.stateService.positions;

    const data = ConstellationMapper.prepareGraphData(
      this.tree(),
      this.filterState(),
      this.registry,
      this.getProvidersForNode(),
      width,
      height,
      this.showComponentTree(),
      positionsSource,
      this.layoutStrategy()
    );

    this.graphStats.set(data.stats);
    this.applyAutoOptimizer(data.stats);
    this.engine.setLinkRenderMode(this.linkRenderMode());
    this.engine.updateGraphData(data.workerNodes, data.workerLinks, data.renderNodes, data.renderLinks, data.stats);
  }

  private applyAutoOptimizer(stats: ConstellationGraphStats): void {
    if (!this.autoOptimizeEnabled() || !this.engine) return;
    if (!stats.isHuge && stats.layoutMode === 'force') return;

    if (this.linkRenderMode() === 'all') {
      this.linkRenderMode.set('adaptive');
    }
    if (this.animationsEnabled()) {
      this.animationsEnabled.set(false);
      this.engine.animationsEnabled = false;
    }
    if (!this.isPaused()) {
      this.isPaused.set(true);
      this.engine.isPaused = true;
    }
  }

  private _updateTooltipPosition(event: MouseEvent, rect: DOMRect) {
    this.tooltipPos.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - 20
    });
  }

  private loadComponentTreeState(): boolean {
    if (!this.isBrowser) return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONSTELLATION_MODE);
      return stored !== null ? stored === 'true' : false;
    } catch (e) {
      return false;
    }
  }

  private loadLinkRenderMode(): ConstellationLinkRenderMode {
    if (!this.isBrowser) return 'adaptive';
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONSTELLATION_LINK_MODE);
      if (stored === 'focused' || stored === 'all' || stored === 'adaptive') return stored;
      return 'adaptive';
    } catch (e) {
      return 'adaptive';
    }
  }

  private loadLayoutStrategy(): ConstellationLayoutStrategy {
    if (!this.isBrowser) return 'auto';
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONSTELLATION_LAYOUT_STRATEGY);
      if (stored === 'auto' || stored === 'atlas' || stored === 'organic') return stored;
      return 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  private loadAutoOptimizeState(): boolean {
    if (!this.isBrowser) return true;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONSTELLATION_AUTO_OPTIMIZE);
      return stored !== null ? stored === 'true' : true;
    } catch (e) {
      return true;
    }
  }

  private saveComponentTreeState(showTree: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY_CONSTELLATION_MODE, String(showTree));
    } catch (e) {
      console.warn('Genie: Failed to save constellation mode state', e);
    }
  }

  private saveLinkRenderMode(mode: ConstellationLinkRenderMode): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY_CONSTELLATION_LINK_MODE, mode);
    } catch (e) {
      console.warn('Genie: Failed to save constellation link mode state', e);
    }
  }

  private saveLayoutStrategy(strategy: ConstellationLayoutStrategy): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY_CONSTELLATION_LAYOUT_STRATEGY, strategy);
    } catch (e) {
      console.warn('Genie: Failed to save constellation layout state', e);
    }
  }

  private saveAutoOptimizeState(enabled: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY_CONSTELLATION_AUTO_OPTIMIZE, String(enabled));
    } catch (e) {
      console.warn('Genie: Failed to save constellation auto optimize state', e);
    }
  }
}
