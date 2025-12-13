import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {OrgChartLegendComponent} from './org-chart-legend/org-chart-legend.component';
import {OrgChartNodeComponent} from './/org-chart-node/org-chart-node.component';
import {OrgChartUtils} from './org-chart.utils';
import {GenieFilterState} from '../../../options-panel/options-panel.models';

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
})
export class OrgChartViewComponent {
  readonly tree = input.required<GenieTreeNode[]>();
  readonly filterState = input<GenieFilterState | null>(null);
  readonly transformStyle = input<string>('');

  readonly isNodeExpanded = input.required<(id: number) => boolean>();
  readonly toggleNode = input.required<(id: number) => void>();
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectService = input.required<(svc: GenieServiceRegistration) => void>();
  readonly selectNode = input.required<(node: GenieTreeNode) => void>();

  readonly filteredTree = computed(() => {
    return OrgChartUtils.filterTree(
      this.tree(),
      this.filterState(),
      this.getProvidersForNode()
    );
  });
}
