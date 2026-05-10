import {ChangeDetectionStrategy, Component, input, output, signal, ViewEncapsulation} from '@angular/core';

import {FormsModule} from '@angular/forms';
import {ConstellationGraphStats, ConstellationLinkRenderMode} from '../constellation.models';

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
  linkRenderMode = input<ConstellationLinkRenderMode>('adaptive');
  autoOptimizeEnabled = input<boolean>(true);
  graphStats = input<ConstellationGraphStats | null>(null);
  pinnedNodeLabel = input<string | null>(null);

  togglePanel = output<void>();
  togglePause = output<void>();
  toggleAnimations = output<void>();
  toggleFocus = output<void>();
  toggleAutoOptimize = output<void>();
  linkModeChange = output<ConstellationLinkRenderMode>();
  clearPin = output<void>();
  resetLayout = output<void>();
  repulsionChange = output<number>();

  protected _togglePanel() {
    this.togglePanel.emit();
  }

  protected formatCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 10_000) return `${Math.round(value / 1000)}k`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
  }
}
