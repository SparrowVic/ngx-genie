import {ChangeDetectionStrategy, Component, signal, ViewEncapsulation} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'lib-org-chart-legend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './org-chart-legend.component.html',
  styleUrl: './org-chart-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OrgChartLegendComponent {
  readonly isOpen = signal(false);

  toggle() {
    this.isOpen.update(v => !v);
  }
}
