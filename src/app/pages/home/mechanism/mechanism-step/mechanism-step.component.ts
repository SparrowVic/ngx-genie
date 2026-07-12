import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../../../core/directives/reveal-on-scroll.directive';
import { MechanismStep } from '../../../../core/models/content.model';

/**
 * app-mechanism-step — a single stage in the "How it works" flow. Shows an
 * accent-tinted numbered node, an icon, a title and a description. Unless it is
 * the last stage, it emits a glowing connector beam toward the next node.
 */
@Component({
  standalone: true,
  selector: 'app-mechanism-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mechanism-step.component.html',
  styleUrl: './mechanism-step.component.scss',
  imports: [IconComponent, RevealOnScrollDirective],
})
export class MechanismStepComponent {
  readonly step = input.required<MechanismStep>();
  readonly index = input.required<number>();
  readonly last = input(false);

  /** Staggered reveal delay so stages cascade in as the section scrolls up. */
  readonly revealDelay = computed(() => this.index() * 110);

  /** The connector beam is only drawn between stages, never after the last. */
  readonly showConnector = computed(() => !this.last());

  /** Zero-padded stage label, e.g. 1 -> "01". */
  readonly label = computed(() => String(this.step().index).padStart(2, '0'));
}
