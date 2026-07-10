import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GenieFeature } from '../../../../core/models/feature.model';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { StatComponent } from '../../../../shared/ui/stat/stat.component';
import { CodeBlockComponent } from '../../../../shared/ui/code-block/code-block.component';
import { ChipComponent } from '../../../../shared/ui/chip/chip.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

/**
 * app-feature-spotlight — the expanded panel for the currently selected
 * inspector view: big name + tagline, description, capability bullets, a stat
 * row and a copyable demo snippet. Everything is tinted by the feature accent,
 * and the body replays its entrance animation whenever the feature changes.
 */
@Component({
  selector: 'app-feature-spotlight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, StatComponent, CodeBlockComponent, ChipComponent, ButtonComponent],
  templateUrl: './feature-spotlight.component.html',
  styleUrl: './feature-spotlight.component.scss',
})
export class FeatureSpotlightComponent {
  readonly feature = input.required<GenieFeature>();

  /** Synthetic filename for the demo code block, e.g. "constellation.genie.ts". */
  readonly demoFilename = computed(() => `${this.feature().id}.genie.ts`);
}
