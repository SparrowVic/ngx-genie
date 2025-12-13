import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  ViewChild
} from '@angular/core';
import {GenieTreeNode, GenieServiceRegistration} from '../../../models/genie-node.model';
import {TreeViewComponent} from '../components/data-views/tree-view/tree-view.component';
import {OrgChartViewComponent} from '../components/data-views/org-chart-view/org-chart-view.component';
import {MatrixViewComponent} from '../components/data-views/matrix-view/matrix-view.component';
import {ConstellationViewComponent} from '../components/data-views/constellation-view/constellation-view.component';
import {DiagnosticsViewComponent} from '../components/data-views/diagnostics-view/diagnostics-view.component';
import {FormsModule} from '@angular/forms';
import {DecimalPipe} from '@angular/common';
import {GenieFilterState} from '../options-panel/options-panel.models';

export type GenieViewMode = 'tree' | 'org' | 'constellation' | 'matrix' | 'diagnostics';

@Component({
  selector: 'lib-viewport',
  standalone: true,
  imports: [
    TreeViewComponent,
    OrgChartViewComponent,
    MatrixViewComponent,
    ConstellationViewComponent,
    DiagnosticsViewComponent,
    FormsModule,
    DecimalPipe
  ],
  templateUrl: './viewport.component.html',
  styleUrl: './viewport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewportComponent {
  @ViewChild('viewportContent') viewportRef!: ElementRef<HTMLElement>;

  tree = input.required<GenieTreeNode[]>();
  filterState = input.required<GenieFilterState>();

  expandedIds = input.required<Set<number>>();

  toggleNode = input.required<(id: number) => void>();
  getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  selectDependency = input.required<(s: GenieServiceRegistration) => void>();
  selectNode = input.required<(n: GenieTreeNode) => void>();


  viewMode = input.required<GenieViewMode>();
  viewModeChange = output<GenieViewMode>();

  protected checkExpandedFn = computed(() => {
    const ids = this.expandedIds();
    return (id: number) => ids.has(id);
  });

  uiScale = signal<number>(1);
  visualScale = signal<number>(1);
  panX = signal<number>(0);
  panY = signal<number>(0);

  protected transformStyle = computed(() =>
    `translate(${this.panX()}px, ${this.panY()}px) scale(${this.visualScale()})`
  );

  protected isStaticView = computed(() =>
    this.viewMode() === 'tree' || this.viewMode() === 'matrix' || this.viewMode() === 'diagnostics'
  );

  constructor() {
    effect(() => {
      this.viewMode();
      this.resetTransform();
    }, {allowSignalWrites: true});
  }

  setMode(mode: GenieViewMode) {
    this.viewModeChange.emit(mode);
  }

  zoomInUi() {
    this.uiScale.update(z => Math.min(z + 0.1, 2.0));
  }

  zoomOutUi() {
    this.uiScale.update(z => Math.max(z - 0.1, 0.5));
  }

  private resetTransform() {
    this.panX.set(0);
    this.panY.set(0);
    this.visualScale.set(1);
  }

  protected onWheel(event: WheelEvent) {
    if (this.isStaticView()) return;
    event.preventDefault();
    event.stopPropagation();

    const currentScale = this.visualScale();
    const zoomFactor = 0.1;
    const delta = event.deltaY > 0 ? -1 : 1;
    let newScale = Math.max(0.1, Math.min(currentScale + (delta * zoomFactor * currentScale), 10.0));

    if (this.viewportRef) {
      const rect = this.viewportRef.nativeElement.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldX = (mouseX - this.panX()) / currentScale;
      const worldY = (mouseY - this.panY()) / currentScale;

      this.visualScale.set(newScale);
      this.panX.set(mouseX - (worldX * newScale));
      this.panY.set(mouseY - (worldY * newScale));
    }
  }

  protected onMouseDown(event: MouseEvent) {
    if (this.isStaticView()) return;
    if ((event.target as HTMLElement).closest('button, .ngx-genie-card, .service-chip')) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialPanX = this.panX();
    const initialPanY = this.panY();

    const moveHandler = (e: MouseEvent) => {
      this.panX.set(initialPanX + (e.clientX - startX));
      this.panY.set(initialPanY + (e.clientY - startY));
    };

    const upHandler = () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  }
}
