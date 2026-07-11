import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../../../core/services/content.service';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { MechanismStepComponent } from './mechanism-step/mechanism-step.component';

/**
 * app-mechanism — the "How it works" section. Renders ContentService.mechanism()
 * as a connected four-stage flow, each stage a <app-mechanism-step> joined by a
 * glowing connector beam that traces the path from interception to visualisation.
 */
@Component({
  selector: 'app-mechanism',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mechanism.component.html',
  styleUrl: './mechanism.component.scss',
  imports: [SectionHeaderComponent, MechanismStepComponent, RevealOnScrollDirective],
})
export class MechanismComponent {
  private readonly content = inject(ContentService);

  /** The ordered pipeline stages sourced from editorial content. */
  readonly steps = this.content.mechanism;

  /** Index of the final stage — the connector beam is suppressed there. */
  readonly lastIndex = computed(() => this.steps().length - 1);
}
