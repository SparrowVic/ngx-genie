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
  signal, effect, untracked, ViewEncapsulation
} from '@angular/core';

import {GenieServiceRegistration, GenieTreeNode} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {ConstellationModeSwitchComponent} from './constellation-mode-switch/constellation-mode-switch.component';
import {ConstellationControlsComponent} from './constellation-controls/constellation-controls.component';
import {ConstellationLegendComponent} from './constellation-legend/constellation-legend.component';
import {ConstellationTooltipComponent} from './constellation-tooltip/constellation-tooltip.component';
import {RenderNode} from './constellation.models';
import {ConstellationEngine} from './constellation.engine';
import {ConstellationMapper} from './constellation.mapper';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {ConstellationStateService} from './constellation-state.service';

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

  readonly tree = input<GenieTreeNode[]>([]);
  readonly filterState = input<GenieFilterState | null>(null);
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectService = input.required<(svc: GenieServiceRegistration) => void>();
  readonly transformStyle = input<string>('');

  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

  readonly hoveredNode = signal<RenderNode | null>(null);

  readonly isPaused = signal(false);
  readonly showComponentTree = signal(false);
  readonly animationsEnabled = signal(true);
  readonly repulsionValue = signal(400);
  readonly focusModeEnabled = signal(true);
  readonly showControlsPanel = signal(true);

  readonly tooltipPos = signal({x: 0, y: 0});

  private engine: ConstellationEngine | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private viewState = {x: 0, y: 0, k: 1};
  private isDragging = false;
  private lastMousePos = {x: 0, y: 0};
  private hasMoved = false;

  constructor() {
    effect(() => {
      this.tree();
      this.filterState();
      this.showComponentTree();

      untracked(() => {
        if (this.engine) {
          this.updateGraphData();
        }
      });
    });
  }

  ngAfterViewInit() {
    this.initEngine();
    this.initResizeObserver();

    this.canvasRef().nativeElement.addEventListener('wheel', this.onWheel.bind(this), {passive: false});
  }

  ngOnDestroy(): void {
    if (this.engine) {
      this.stateService.savePositions(this.engine.getRenderNodes());
      this.stateService.saveViewTransform(this.viewState);
      this.engine.destroy();
    }
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.canvasRef().nativeElement.removeEventListener('wheel', this.onWheel.bind(this));
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

    if (node && node.type === 'service') {
      this.ngZone.run(() => this.selectService()(node.data));
    }
  }

  private handleHover(event: MouseEvent) {
    if (!this.engine) return;
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
  }

  toggleAnimations() {
    this.animationsEnabled.update(v => !v);
    if (this.engine) this.engine.animationsEnabled = this.animationsEnabled();
  }

  toggleFocusMode() {
    this.focusModeEnabled.update(v => !v);
    if (this.engine) this.engine.focusModeEnabled = this.focusModeEnabled();
  }

  toggleControlsPanel() {
    this.showControlsPanel.update(v => !v);
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
      this.updateGraphData(width, height);
    });
    this.resizeObserver.observe(this.containerRef().nativeElement);
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
      positionsSource
    );

    this.engine.updateGraphData(data.workerNodes, data.workerLinks, data.renderNodes, data.renderLinks);
  }

  private _updateTooltipPosition(event: MouseEvent, rect: DOMRect) {
    this.tooltipPos.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - 20
    });
  }
}
