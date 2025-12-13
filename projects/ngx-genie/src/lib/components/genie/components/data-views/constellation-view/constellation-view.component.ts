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
  signal, effect, untracked
} from '@angular/core';
import {CommonModule} from '@angular/common';
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

@Component({
  selector: 'lib-constellation-view',
  standalone: true,
  imports: [
    CommonModule,
    ConstellationModeSwitchComponent,
    ConstellationControlsComponent,
    ConstellationLegendComponent,
    ConstellationTooltipComponent
  ],
  templateUrl: './constellation-view.component.html',
  styleUrl: './constellation-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstellationViewComponent implements OnDestroy, AfterViewInit {
  private registry = inject(GenieRegistryService);
  private ngZone = inject(NgZone);


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


    effect(() => {
      const style = this.transformStyle();
      untracked(() => {
        if (this.engine) {
          this.engine.updateTransform(this._parseTransformStyle(style));
        }
      });
    });
  }

  ngAfterViewInit() {
    this.initEngine();
    this.initResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.engine) this.engine.destroy();
    if (this.resizeObserver) this.resizeObserver.disconnect();
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

    const data = ConstellationMapper.prepareGraphData(
      this.tree(),
      this.filterState(),
      this.registry,
      this.getProvidersForNode(),
      width,
      height,
      this.showComponentTree(),
      this.engine.getRenderNodes()
    );

    this.engine.updateGraphData(data.workerNodes, data.workerLinks, data.renderNodes, data.renderLinks);
  }


  onCanvasClick(event: MouseEvent) {
    if (!this.engine) return;
    const rect = this.containerRef().nativeElement.getBoundingClientRect();
    const node = this.engine.getHitNode(event.clientX, event.clientY, rect);

    if (node && node.type === 'service') {
      this.ngZone.run(() => this.selectService()(node.data));
    }
  }

  onCanvasMouseMove(event: MouseEvent) {
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


  onCanvasMouseLeave() {
    this.ngZone.run(() => {
      this.hoveredNode.set(null);
      if (this.engine) {
        this.engine.setHoveredNode(null);
      }
      this.canvasRef().nativeElement.style.cursor = 'default';
    });
  }

  private _updateTooltipPosition(event: MouseEvent, rect: DOMRect) {
    this.tooltipPos.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - 20
    });
  }

  private _parseTransformStyle(style: string) {
    if (!style) return {x: 0, y: 0, k: 1};
    let x = 0, y = 0, k = 1;
    const translateMatch = style.match(/translate(?:3d)?\(\s*([-\d.]+)(?:px)?,\s*([-\d.]+)(?:px)?/);
    if (translateMatch) {
      x = parseFloat(translateMatch[1]) || 0;
      y = parseFloat(translateMatch[2]) || 0;
    }
    const scaleMatch = style.match(/scale\(\s*([-\d.]+)\s*\)/);
    if (scaleMatch) k = parseFloat(scaleMatch[1]) || 1;
    return {x, y, k};
  }
}
