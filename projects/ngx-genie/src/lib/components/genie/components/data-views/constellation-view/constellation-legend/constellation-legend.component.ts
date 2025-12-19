import {ChangeDetectionStrategy, Component, signal, ViewEncapsulation} from '@angular/core';


@Component({
  selector: 'lib-constellation-legend',
  standalone: true,
  imports: [],
  templateUrl: './constellation-legend.component.html',
  styleUrl: './constellation-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class ConstellationLegendComponent {
  readonly isOpen = signal(false);

  toggle() {
    this.isOpen.update(v => !v);
  }
}
