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
import {OrgChartUtils} from './org-chart.utils';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {OrgChartStateService} from './org-chart-state.service';

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

  readonly filteredTree = computed(() => {
    return OrgChartUtils.filterTree(
      this.tree(),
      this.filterState(),
      this.getProvidersForNode()
    );
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
}
