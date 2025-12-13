import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'lib-tree-legend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tree-legend.component.html',
  styleUrl: './tree-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TreeLegendComponent {
  isExpanded = signal(false);

  toggle() {
    this.isExpanded.update(v => !v);
  }
}
