import {ChangeDetectionStrategy, Component, signal, ViewEncapsulation} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'lib-matrix-legend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'matrix-legend.component.html',
  styleUrl: './matrix-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MatrixLegendComponent {
  readonly isOpen = signal(false);

  toggle() {
    this.isOpen.update(v => !v);
  }
}
