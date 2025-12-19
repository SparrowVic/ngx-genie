import {ChangeDetectionStrategy, Component, signal, ViewEncapsulation} from '@angular/core';


@Component({
  selector: 'lib-org-chart-legend',
  standalone: true,
  imports: [],
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
