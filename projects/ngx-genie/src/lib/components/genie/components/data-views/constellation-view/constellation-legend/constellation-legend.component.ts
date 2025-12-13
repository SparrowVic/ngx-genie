import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'lib-constellation-legend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './constellation-legend.component.html',
  styleUrl: './constellation-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstellationLegendComponent {
  readonly isOpen = signal(false);

  toggle() {
    this.isOpen.update(v => !v);
  }
}
