import {ChangeDetectionStrategy, Component, signal, ViewEncapsulation} from '@angular/core';


@Component({
  selector: 'lib-tree-legend',
  standalone: true,
  imports: [],
  templateUrl: './tree-legend.component.html',
  styleUrl: './tree-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class TreeLegendComponent {
  isExpanded = signal(false);

  toggle() {
    this.isExpanded.update(v => !v);
  }
}
