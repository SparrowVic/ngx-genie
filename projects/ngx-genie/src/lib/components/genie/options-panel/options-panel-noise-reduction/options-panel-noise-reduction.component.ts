import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'lib-options-panel-noise-reduction',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './options-panel-noise-reduction.component.html',
  styleUrl: './options-panel-noise-reduction.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OptionsPanelNoiseReductionComponent {
  readonly hideInternals = input.required<boolean>();
  readonly groupSimilarSiblings = input.required<boolean>();
  readonly hideUnusedDeps = input.required<boolean>();
  readonly hideIsolatedComponents = input.required<boolean>();

  readonly updateHideInternals = output<boolean>();
  readonly updateGroupSimilarSiblings = output<boolean>();
  readonly updateHideUnusedDeps = output<boolean>();
  readonly updateHideIsolatedComponents = output<boolean>();
}
