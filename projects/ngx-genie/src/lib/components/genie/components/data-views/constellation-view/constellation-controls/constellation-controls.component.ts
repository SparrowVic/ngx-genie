import {ChangeDetectionStrategy, Component, input, output, signal, ViewEncapsulation} from '@angular/core';

import {FormsModule} from '@angular/forms';

@Component({
  selector: 'lib-constellation-controls',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './constellation-controls.component.html',
  styleUrl: './constellation-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class ConstellationControlsComponent {
  isOpen = input<boolean>(true);
  isPaused = input<boolean>(false);
  animationsEnabled = input<boolean>(true);
  focusModeEnabled = input<boolean>(true);
  repulsionValue = input<number>(400);

  togglePanel = output<void>();
  togglePause = output<void>();
  toggleAnimations = output<void>();
  toggleFocus = output<void>();
  resetLayout = output<void>();
  repulsionChange = output<number>();

  protected _togglePanel() {
    this.togglePanel.emit();
  }
}
