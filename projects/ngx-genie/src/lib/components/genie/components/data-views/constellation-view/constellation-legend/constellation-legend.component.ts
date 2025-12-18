import {ChangeDetectionStrategy, Component, signal, ViewEncapsulation} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'lib-constellation-legend',
  standalone: true,
  imports: [CommonModule],
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
