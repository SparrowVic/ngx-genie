import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TiltDirective } from '../../../core/directives/tilt.directive';

/**
 * ui-glass-panel — the glassmorphism card wrapper. Uses the global .panel
 * surface; when interactive it lifts + tilts under the pointer, and when a glow
 * colour is supplied it blooms a soft coloured shadow on hover.
 */
@Component({
  selector: 'ui-glass-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './glass-panel.component.html',
  styleUrl: './glass-panel.component.scss',
  imports: [TiltDirective],
})
export class GlassPanelComponent {
  readonly glow = input('');
  readonly interactive = input(false);

  /** Tilt degrees fed to appTilt — 0 disables it when non-interactive. */
  readonly tiltDeg = computed(() => (this.interactive() ? 8 : 0));

  /** Whether a glow colour was supplied (drives the hover-bloom class). */
  readonly hasGlow = computed(() => this.glow().trim().length > 0);

  /** The coloured box-shadow layered on hover when a glow colour is set. */
  readonly glowShadow = computed(() =>
    this.hasGlow() ? `0 0 52px -6px ${this.glow()}` : null,
  );
}
