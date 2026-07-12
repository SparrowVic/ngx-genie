import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';

import {FormsModule} from '@angular/forms';
import {
  ConstellationGroupingStrategy,
  ConstellationGraphStats,
  ConstellationLinkRenderMode
} from '../models/constellation.models';

@Component({
  selector: 'lib-constellation-controls',
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
  groupingStrategy = input<ConstellationGroupingStrategy>('auto');
  autoOptimizeEnabled = input<boolean>(true);
  graphStats = input<ConstellationGraphStats | null>(null);
  pinnedNodeLabel = input<string | null>(null);

  togglePanel = output<void>();
  togglePause = output<void>();
  toggleAnimations = output<void>();
  toggleFocus = output<void>();
  toggleAutoOptimize = output<void>();
  linkModeChange = output<ConstellationLinkRenderMode>();
  groupingStrategyChange = output<ConstellationGroupingStrategy>();
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

  protected groupingStrategyLabel(strategy: ConstellationGroupingStrategy): string {
    if (strategy === 'node-type' || strategy === 'type') return 'NODE TYPES';
    if (strategy === 'scope') return 'SCOPE';
    if (strategy === 'tree') return 'TREE';
    if (strategy === 'none') return 'OFF';
    return 'AUTO';
  }

  protected layoutModeValue(stats: ConstellationGraphStats): string {
    if (stats.layoutMode === 'force') return this.formatCount(stats.simulationLinks);
    return 'SPREAD';
  }

  /** The live force simulation only runs in 'force' layout; physics controls are N/A when grouped/static. */
  protected isForceLayout(): boolean {
    const mode = this.graphStats()?.layoutMode;
    return !mode || mode === 'force';
  }
}
