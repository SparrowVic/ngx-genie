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
  OnInit,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {
  GenieServiceRegistration,
  GenieTreeNode
} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {MatrixSettings, MatrixSettingsComponent} from '../matrix-view/matrix-settings/matrix-settings.component';
import {MatrixLoadingComponent} from '../matrix-view/matrix-loading/matrix-loading.component';
import {MatrixLegendComponent} from '../matrix-view/matrix-legend/matrix-legend.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import type {ProcessedCell} from './matrix.worker';
import {MatrixDataService} from './matrix-data.service';
import {MatrixRainRenderer} from './matrix-rain-renderer.class';
import {BASE_CELL_SIZE, BASE_HEADER_HEIGHT, BASE_ROW_WIDTH, FONT_FAMILY, THEME} from './matrix.configs';

@Component({
  selector: 'gen-matrix-view',
  standalone: true,
  imports: [
    CommonModule,
    MatrixSettingsComponent,
    MatrixLoadingComponent,
    MatrixLegendComponent
  ],
  templateUrl: './matrix-view.component.html',
  styleUrl: './matrix-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenieMatrixViewComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly registry = inject(GenieRegistryService);
  private readonly ngZone = inject(NgZone);
  private readonly el = inject(ElementRef);
  private readonly dataService = inject(MatrixDataService);

  private readonly rainRenderer = new MatrixRainRenderer();

  readonly tree = input.required<GenieTreeNode[]>();
  readonly filterState = input<GenieFilterState | null>(null);
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();

  readonly selectService = input.required<(svc: GenieServiceRegistration) => void>();
  readonly selectNode = input.required<(node: GenieTreeNode) => void>();

  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('mainCanvas');
  readonly scrollerRef = viewChild.required<ElementRef<HTMLDivElement>>('virtualScroller');

  readonly isWorkerDone = this.dataService.isWorkerDone;


  private readonly isAnimationDone = signal(this.dataService.isWorkerDone());

  readonly isLoading = computed(() => !this.isWorkerDone() || !this.isAnimationDone());

  readonly settings = signal<MatrixSettings>({rain: true, animation: true});

  private scale = 1.0;
  private scrollX = 0;
  private scrollY = 0;
  private viewWidth = 0;
  private viewHeight = 0;

  readonly virtualWidth = signal(0);
  readonly virtualHeight = signal(0);

  private hoveredCell: { r: number, c: number } | null = null;
  private hoveredHeaderCol: number = -1;
  private hoveredHeaderRow: number = -1;

  private ctx!: CanvasRenderingContext2D;
  private animationId = 0;
  private resizeObserver: ResizeObserver | null = null;

  private readonly nodeMap = computed(() => {
    const map = new Map<number, GenieTreeNode>();
    const traverse = (nodes: GenieTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        if (node.children) traverse(node.children);
      }
    };
    traverse(this.tree());
    return map;
  });

  constructor() {
    effect(() => {
      const tree = this.tree();
      const filter = this.filterState();
      untracked(() => this.dataService.calculate(tree, filter));
    });

    effect(() => {
      if (this.isWorkerDone()) {
        untracked(() => {
          this.updateVirtualDimensions();

          if (this.scrollerRef()) {
            const {scrollX, scrollY} = this.dataService.viewState;
            this.scrollerRef().nativeElement.scrollTo(scrollX, scrollY);

            this.scrollX = scrollX;
            this.scrollY = scrollY;
          }

          if (this.viewWidth > 0) {
            this.rainRenderer.resize(
              this.viewWidth,
              this.viewHeight,
              window.devicePixelRatio || 1,
              BASE_ROW_WIDTH * this.scale,
              BASE_HEADER_HEIGHT * this.scale
            );
          }
        });
      }
    });
  }

  ngOnInit() {
    this.dataService.initWorker();

    this.scale = this.dataService.viewState.scale;
  }

  ngAfterViewInit() {
    this.initCanvas();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.el.nativeElement);
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();

    this.dataService.saveViewState({
      scale: this.scale,
      scrollX: this.scrollX,
      scrollY: this.scrollY
    });
  }

  onLoadingAnimationComplete() {
    this.isAnimationDone.set(true);
    setTimeout(() => this.handleResize(), 50);
  }

  updateSettings(newSettings: MatrixSettings) {
    this.settings.set(newSettings);
  }

  resetView() {
    this.scale = 1.0;
    if (this.scrollerRef()) {
      this.scrollerRef().nativeElement.scrollTo(0, 0);
      this.scrollX = 0;
      this.scrollY = 0;
    }
    this.updateVirtualDimensions();
  }

  onScroll(event: Event) {
    const target = event.target as HTMLElement;
    this.scrollX = target.scrollLeft;
    this.scrollY = target.scrollTop;
  }

  private updateVirtualDimensions() {
    const totalCols = this.dataService.totalCols();
    const totalRows = this.dataService.totalRows();

    const headerH = BASE_HEADER_HEIGHT * this.scale;
    const footerH = 40;
    const rowW = BASE_ROW_WIDTH * this.scale;

    const dataW = totalCols * BASE_CELL_SIZE * this.scale;
    const dataH = totalRows * BASE_CELL_SIZE * this.scale;

    const minGridCols = Math.max(totalCols, 50);
    const minGridW = minGridCols * BASE_CELL_SIZE * this.scale;

    this.virtualWidth.set(Math.max(rowW + dataW + 100, rowW + minGridW));
    this.virtualHeight.set(headerH + dataH + footerH);
  }

  private initCanvas() {
    const canvas = this.canvasRef().nativeElement;
    const interactionLayer = this.scrollerRef().nativeElement;

    this.ctx = canvas.getContext('2d', {alpha: false})!;
    this.rainRenderer.init();

    interactionLayer.addEventListener('mousemove', this.handleMouseMove.bind(this));
    interactionLayer.addEventListener('click', this.handleMouseClick.bind(this));
    interactionLayer.addEventListener('wheel', this.handleWheel.bind(this), {passive: false});
    interactionLayer.addEventListener('mouseleave', () => {
      this.hoveredCell = null;
      this.hoveredHeaderCol = -1;
      this.hoveredHeaderRow = -1;
    });

    this.ngZone.runOutsideAngular(() => this.renderLoop(0));
  }

  private handleResize() {
    const canvas = this.canvasRef().nativeElement;
    const rect = this.el.nativeElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.viewWidth = rect.width;
    this.viewHeight = rect.height;

    canvas.width = this.viewWidth * dpr;
    canvas.height = this.viewHeight * dpr;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.rainRenderer.resize(
      this.viewWidth,
      this.viewHeight,
      dpr,
      BASE_ROW_WIDTH * this.scale,
      BASE_HEADER_HEIGHT * this.scale
    );
  }

  private renderLoop = (time: number) => {
    this.animationId = requestAnimationFrame(this.renderLoop);

    if (this.scrollerRef()) {
      const scroller = this.scrollerRef().nativeElement;
      this.scrollX = scroller.scrollLeft;
      this.scrollY = scroller.scrollTop;
    }

    if (this.settings().rain) {
      this.rainRenderer.updateRain(time, this.viewWidth, this.viewHeight);
      const rainCanvas = this.rainRenderer.getRainCanvas();
      if (rainCanvas) {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.drawImage(rainCanvas, 0, 0);
        this.ctx.restore();
      }
    } else {
      this.ctx.fillStyle = THEME.bgDeep;
      this.ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    }

    if (!this.isWorkerDone()) return;

    const rows = this.dataService.rows();
    const columns = this.dataService.columns();
    const totalCols = this.dataService.totalCols();
    const totalRows = this.dataService.totalRows();

    const cs = BASE_CELL_SIZE * this.scale;
    const rowW = BASE_ROW_WIDTH * this.scale;
    const headerH = BASE_HEADER_HEIGHT * this.scale;

    const sx = this.scrollX;
    const sy = this.scrollY;

    const gridStartCol = Math.max(0, Math.floor((sx - rowW) / cs));
    const gridEndCol = Math.ceil((sx - rowW + this.viewWidth) / cs);

    const gridStartRow = Math.max(0, Math.floor((sy - headerH) / cs));
    const gridEndRow = Math.ceil((sy - headerH + this.viewHeight) / cs);

    const dataStartCol = Math.max(0, Math.floor((sx - rowW) / cs));
    const dataEndCol = Math.min(totalCols, Math.ceil((sx - rowW + this.viewWidth) / cs));

    const dataStartRow = Math.max(0, Math.floor((sy - headerH) / cs));
    const dataEndRow = Math.min(totalRows, Math.ceil((sy - headerH + this.viewHeight) / cs));

    this.ctx.save();

    const dataOriginX = rowW - sx;
    const dataOriginY = headerH - sy;

    this.ctx.strokeStyle = THEME.gridLine;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();

    for (let c = gridStartCol; c <= gridEndCol; c++) {
      const x = Math.floor(dataOriginX + c * cs) + 0.5;
      this.ctx.moveTo(x, Math.max(headerH, dataOriginY));
      this.ctx.lineTo(x, this.viewHeight);
    }
    for (let r = gridStartRow; r <= gridEndRow; r++) {
      const y = Math.floor(dataOriginY + r * cs) + 0.5;
      this.ctx.moveTo(Math.max(rowW, dataOriginX), y);
      this.ctx.lineTo(this.viewWidth, y);
    }
    this.ctx.stroke();

    const highlightC = this.hoveredCell ? this.hoveredCell.c : this.hoveredHeaderCol;
    const highlightR = this.hoveredCell ? this.hoveredCell.r : this.hoveredHeaderRow;

    if (highlightR !== -1) {
      const hy = dataOriginY + highlightR * cs;
      this.ctx.fillStyle = 'rgba(0, 255, 65, 0.05)';
      this.ctx.fillRect(rowW, hy, this.viewWidth - rowW, cs);

      this.ctx.shadowBlur = 5;
      this.ctx.shadowColor = THEME.primary;
      this.ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
      this.ctx.fillRect(rowW, hy, this.viewWidth - rowW, 1);
      this.ctx.fillRect(rowW, hy + cs - 1, this.viewWidth - rowW, 1);
      this.ctx.shadowBlur = 0;
    }
    if (highlightC !== -1) {
      const hx = dataOriginX + highlightC * cs;
      this.ctx.fillStyle = 'rgba(0, 255, 65, 0.05)';
      this.ctx.fillRect(hx, headerH, cs, this.viewHeight - headerH);

      this.ctx.shadowBlur = 5;
      this.ctx.shadowColor = THEME.primary;
      this.ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
      this.ctx.fillRect(hx, headerH, 1, this.viewHeight - headerH);
      this.ctx.fillRect(hx + cs - 1, headerH, 1, this.viewHeight - headerH);
      this.ctx.shadowBlur = 0;
    }

    for (let r = dataStartRow; r < dataEndRow; r++) {
      const rowData = rows[r];
      if (!rowData) continue;

      for (const [colIdx, cell] of rowData.cells) {
        if (colIdx < dataStartCol || colIdx >= dataEndCol) continue;

        const cx = dataOriginX + colIdx * cs;
        const cy = dataOriginY + r * cs;

        const isHoveredRow = (highlightR === r);
        const isHoveredCol = (highlightC === colIdx);

        this.drawCell(cell, cx, cy, cs, time, isHoveredRow, isHoveredCol);
      }
    }
    this.ctx.restore();

    this.drawHeaders(columns, rows, rowW, headerH, dataStartCol, dataEndCol, dataStartRow, dataEndRow, dataOriginX, dataOriginY, cs, highlightC, highlightR);
    this.drawCorner(rowW, headerH, time);
  };

  private drawHeaders(
    columns: any[], rows: any[],
    rowW: number, headerH: number,
    startCol: number, endCol: number,
    startRow: number, endRow: number,
    originX: number, originY: number,
    cs: number,
    activeColIdx: number, activeRowIdx: number
  ) {
    this.ctx.fillStyle = THEME.bgPanel;
    this.ctx.fillRect(0, 0, this.viewWidth, headerH);
    this.ctx.fillRect(0, 0, rowW, this.viewHeight);

    this.ctx.strokeStyle = THEME.primary;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, headerH + 0.5);
    this.ctx.lineTo(this.viewWidth, headerH + 0.5);
    this.ctx.moveTo(rowW + 0.5, 0);
    this.ctx.lineTo(rowW + 0.5, this.viewHeight);
    this.ctx.stroke();

    this.ctx.save();
    this.ctx.rect(rowW, 0, this.viewWidth - rowW, headerH);
    this.ctx.clip();

    for (let c = startCol; c < endCol; c++) {
      const col = columns[c];
      const x = originX + c * cs;
      const isActive = (c === activeColIdx);

      if (isActive) {
        const grad = this.ctx.createLinearGradient(x, 0, x, headerH);
        grad.addColorStop(0, 'rgba(0, 255, 65, 0.0)');
        grad.addColorStop(1, 'rgba(0, 255, 65, 0.35)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x, 0, cs, headerH);

        this.ctx.fillStyle = THEME.primary;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = THEME.primary;
        this.ctx.fillRect(x, headerH - 3, cs, 3);
        this.ctx.shadowBlur = 0;
      }

      this.ctx.strokeStyle = 'rgba(0, 255, 65, 0.15)';
      this.ctx.beginPath();
      this.ctx.moveTo(x + cs, 0);
      this.ctx.lineTo(x + cs, headerH);
      this.ctx.stroke();

      this.ctx.save();
      this.ctx.translate(x + cs / 2, headerH - 12);
      this.ctx.rotate(-Math.PI / 4);
      this.ctx.font = isActive ? `bold 12px ${FONT_FAMILY}` : `12px ${FONT_FAMILY}`;
      this.ctx.textAlign = 'left';

      const textColor = THEME.colors[col.typeClass] || THEME.textHeader;
      this.ctx.fillStyle = isActive ? '#ffffff' : textColor;

      if (isActive) {
        this.ctx.shadowColor = textColor;
        this.ctx.shadowBlur = 10;
      }

      this.ctx.fillText(col.label, 0, 0);
      this.ctx.restore();
    }
    this.ctx.restore();

    this.ctx.save();
    this.ctx.rect(0, headerH, rowW, this.viewHeight - headerH);
    this.ctx.clip();

    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      const y = originY + r * cs;
      const isActive = (r === activeRowIdx);

      if (isActive) {
        const grad = this.ctx.createLinearGradient(0, y, rowW, y);
        grad.addColorStop(0, 'rgba(0, 255, 65, 0.05)');
        grad.addColorStop(1, 'rgba(0, 255, 65, 0.35)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, y, rowW, cs);

        this.ctx.fillStyle = THEME.primary;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = THEME.primary;
        this.ctx.fillRect(0, y, 4, cs);
        this.ctx.shadowBlur = 0;
      }

      this.ctx.font = isActive ? `bold ${12 * this.scale}px ${FONT_FAMILY}` : `${12 * this.scale}px ${FONT_FAMILY}`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = isActive ? '#ffffff' : THEME.textHeader;

      if (isActive) {
        this.ctx.shadowColor = THEME.primary;
        this.ctx.shadowBlur = 8;
      } else {
        this.ctx.shadowBlur = 0;
      }

      const xOffset = isActive ? 18 : 12;

      this.ctx.globalAlpha = 0.5;
      this.ctx.font = `10px ${FONT_FAMILY}`;
      this.ctx.fillText((r + 1).toString(), xOffset, y + cs / 2);
      this.ctx.globalAlpha = 1;

      this.ctx.font = `${12 * this.scale}px ${FONT_FAMILY}`;
      this.ctx.fillText(row.label, xOffset + 30, y + cs / 2);

      this.ctx.strokeStyle = 'rgba(0, 255, 65, 0.15)';
      this.ctx.beginPath();
      this.ctx.moveTo(0, y + cs);
      this.ctx.lineTo(rowW, y + cs);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawCell(
    cell: ProcessedCell,
    x: number, y: number, size: number,
    time: number,
    isRowHover: boolean, isColHover: boolean
  ) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const color = THEME.colors[cell.typeClass] || '#fff';

    const isDirectHover = isRowHover && isColHover;
    const isUserCode = !cell.isFramework;

    if (isDirectHover) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      this.ctx.fillRect(x, y, size, size);
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = color;
    } else {
      this.ctx.shadowBlur = 0;
    }

    if (cell.isConsumer) {
      let rotation = Math.PI / 4;
      let scale = 1.0;

      if (isDirectHover) {
        rotation += (time / 200);
        scale = 1.3;
      } else if (cell.isFramework && this.settings().animation) {
        scale = 1.0 + Math.sin(time / 500) * 0.1;
      } else if (!cell.isFramework && this.settings().animation) {
        scale = 1.0 + Math.sin(time / 300) * 0.05;
      }

      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(rotation);
      this.ctx.scale(scale, scale);

      const r = size * 0.22;
      this.ctx.beginPath();
      this.ctx.rect(-r, -r, r * 2, r * 2);

      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;

      if (isUserCode) {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;
        this.ctx.fill();
      } else {
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
      this.ctx.restore();
    } else if (cell.isProvider) {
      let r = size * 0.18;

      if (this.settings().animation) {
        const pulse = (Math.sin(time / 200) + 1) / 2;
        if (isUserCode) {
          r = size * 0.18 + (pulse * 1);
        }
      }

      if (isDirectHover) r *= 1.3;

      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);

      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;

      if (isUserCode) {
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = color;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        this.ctx.fill();

      } else {
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    } else if (isDirectHover) {
      this.ctx.fillStyle = '#fff';
      this.ctx.shadowBlur = 5;
      this.ctx.shadowColor = '#fff';
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.shadowBlur = 0;
  }

  private drawCorner(w: number, h: number, time: number) {
    this.ctx.fillStyle = THEME.bgPanel;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.strokeStyle = THEME.primary;
    this.ctx.strokeRect(0, 0, w, h);

    this.rainRenderer.drawCornerContent(this.ctx, w, h, time, this.settings().rain);
  }

  private getGridCoordinates(e: MouseEvent): {
    type: 'data' | 'col-header' | 'row-header',
    c: number,
    r: number
  } | null {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cs = BASE_CELL_SIZE * this.scale;
    const rowW = BASE_ROW_WIDTH * this.scale;
    const headerH = BASE_HEADER_HEIGHT * this.scale;

    const scroller = this.scrollerRef().nativeElement;
    const scrollX = scroller.scrollLeft;
    const scrollY = scroller.scrollTop;

    const dataOriginX = rowW - scrollX;
    const dataOriginY = headerH - scrollY;

    const inTop = x >= rowW && y < headerH;
    const inLeft = x < rowW && y >= headerH;
    const inData = x >= rowW && y >= headerH;

    const totalCols = this.dataService.totalCols();
    const totalRows = this.dataService.totalRows();

    if (inData) {
      const c = Math.floor((x - dataOriginX) / cs);
      const r = Math.floor((y - dataOriginY) / cs);

      if (c >= 0 && c < totalCols && r >= 0 && r < totalRows) {
        return {type: 'data', c, r};
      }
    } else if (inTop) {
      const c = Math.floor((x - dataOriginX) / cs);
      if (c >= 0 && c < totalCols) {
        return {type: 'col-header', c, r: -1};
      }
    } else if (inLeft) {
      const r = Math.floor((y - dataOriginY) / cs);
      if (r >= 0 && r < totalRows) {
        return {type: 'row-header', c: -1, r};
      }
    }

    return null;
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isWorkerDone()) return;

    const hit = this.getGridCoordinates(e);

    this.hoveredCell = null;
    this.hoveredHeaderCol = -1;
    this.hoveredHeaderRow = -1;

    if (hit) {
      if (hit.type === 'data') {
        this.hoveredCell = {c: hit.c, r: hit.r};
      } else if (hit.type === 'col-header') {
        this.hoveredHeaderCol = hit.c;
      } else if (hit.type === 'row-header') {
        this.hoveredHeaderRow = hit.r;
      }
    }
  }

  private handleMouseClick(e: MouseEvent) {
    if (!this.isWorkerDone()) return;

    const hit = this.getGridCoordinates(e);

    if (hit) {
      const rows = this.dataService.rows();
      const columns = this.dataService.columns();

      if (hit.type === 'data') {
        const row = rows[hit.r];
        const cell = row.cells.get(hit.c);

        const nodeId = Number(row.id);
        const node = this.nodeMap().get(nodeId);
        if (node) {
          this.selectNode()(node);
        }

        if (cell && (cell.active)) {
          const col = columns[hit.c];
          if (col && col.service) {
            const fullService = this.registry.services().find(s => s.id === col.service.id);
            this.selectService()(fullService || col.service);
          }
        }
      } else if (hit.type === 'row-header') {
        const row = rows[hit.r];
        const nodeId = Number(row.id);
        const node = this.nodeMap().get(nodeId);
        if (node) {
          this.selectNode()(node);
        }
      }
    }
  }

  private handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.1;
      const newScale = Math.max(0.5, Math.min(2.5, this.scale + delta));

      if (newScale !== this.scale) {
        this.scale = newScale;
        this.updateVirtualDimensions();
      }
    }
  }
}
