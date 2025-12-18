import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Input,
  output,
  ViewEncapsulation
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {GenieResizableDirective} from '../../../../../shared/directives/resizable/resizable.directive';
import {TreeLegendComponent} from './tree-legend/tree-legend.component';
import {GenieFilterState} from '../../../options-panel/options-panel.models';
import {OrgChartUtils} from '../org-chart-view/org-chart.utils';
import {TreeNodeComponent} from './tree-node/tree-node.component';

@Component({
  selector: 'lib-tree-view',
  standalone: true,
  imports: [CommonModule, TreeLegendComponent, GenieResizableDirective, TreeNodeComponent],
  providers: [GenieResizableDirective],
  templateUrl: './tree-view.component.html',
  styleUrl: './tree-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class TreeViewComponent {
  readonly tree = input.required<GenieTreeNode[]>();
  readonly filterState = input<GenieFilterState | null>(null);
  readonly isNodeExpanded = input.required<(id: number) => boolean>();
  readonly toggleNode = input.required<(id: number) => void>();
  readonly selectNode = input.required<(node: GenieTreeNode) => void>();
  readonly selectDependency = input.required<(dep: GenieServiceRegistration) => void>();
  readonly getProvidersForNode = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();
  readonly selectedNode = input<GenieTreeNode | null>(null);
  readonly selectedDependency = input<GenieServiceRegistration | null>(null);

  readonly filteredTree = computed(() => {
    return OrgChartUtils.filterTree(
      this.tree(),
      this.filterState(),
      this.getProvidersForNode()
    );
  });

  protected readonly _selectedNodeId = computed(() => this.selectedNode()?.id ?? null);
  protected readonly _selectedDependencyId = computed(() => this.selectedDependency()?.id ?? null);
}
