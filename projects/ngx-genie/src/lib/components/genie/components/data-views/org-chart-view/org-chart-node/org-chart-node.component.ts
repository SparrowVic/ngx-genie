import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {OrgChartUtils} from '../org-chart.utils';
import {GenieTreeNode, GenieServiceRegistration} from '../../../../../../models/genie-node.model';
import {NgIf, NgFor, NgClass} from '@angular/common';

@Component({
  selector: 'lib-org-chart-node',
  standalone: true,
  imports: [NgIf, NgFor, NgClass],
  templateUrl: './org-chart-node.component.html',
  styleUrl: './org-chart-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgChartNodeComponent {

  readonly node = input.required<GenieTreeNode>();
  readonly services = input.required<GenieServiceRegistration[]>();
  readonly expanded = input<boolean>(false);


  readonly nodeClick = output<GenieTreeNode>();
  readonly serviceClick = output<GenieServiceRegistration>();
  readonly toggleClick = output<void>();


  readonly hasChildren = computed(() => (this.node().children?.length || 0) > 0);
  readonly isCluster = computed(() => (this.node().groupCount || 0) > 1);


  isRoot(svc: GenieServiceRegistration): boolean {
    return OrgChartUtils.isRoot(svc);
  }

  getAbbrType(type: string): string {
    return OrgChartUtils.getAbbrType(type);
  }
}
