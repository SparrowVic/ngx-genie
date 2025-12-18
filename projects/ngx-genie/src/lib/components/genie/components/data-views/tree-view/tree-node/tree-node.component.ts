import {ChangeDetectionStrategy, Component, computed, input, output, ViewEncapsulation} from '@angular/core';
import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {TreeDependencyItemComponent} from '../tree-dependency-item/tree-dependency-item.component';
import {NgIf} from '@angular/common';

@Component({
  selector: 'lib-tree-node',
  standalone: true,
  imports: [
    TreeDependencyItemComponent,
    NgIf
  ],
  templateUrl: './tree-node.component.html',
  styleUrl: './tree-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class TreeNodeComponent {
  node = input.required<GenieTreeNode>();
  dependenciesFetcher = input.required<(node: GenieTreeNode) => GenieServiceRegistration[]>();

  selectedNodeId = input<number | null>(null);
  selectedDependencyId = input<number | null>(null);

  isNodeExpanded = input.required<(id: number) => boolean>();
  toggleNode = input.required<(id: number) => void>();
  selectNode = input.required<(node: GenieTreeNode) => void>();
  selectDependency = input.required<(dep: GenieServiceRegistration) => void>();


  protected readonly _node = this.node;


  protected readonly _isExpanded = computed(() =>
    this.isNodeExpanded()(this.node().id)
  );

  protected readonly _isActive = computed(() =>
    this.selectedNodeId() === this.node().id
  );

  protected readonly _dependencies = computed(() => {
    const fetcher = this.dependenciesFetcher();
    return fetcher ? fetcher(this.node()) : [];
  });

  protected readonly _hasChildrenOrDependencies = computed(() => {
    return (this.node().children?.length || 0) > 0 || this._dependencies().length > 0;
  });


  protected _toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.toggleNode()(this.node().id);
  }

  protected _handleNodeClick(event: MouseEvent): void {
    this.selectNode()(this.node());
  }
}
