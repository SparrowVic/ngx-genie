import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'lib-options-panel-complexity-filter',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './options-panel-complexity-filter.component.html',
  styleUrl: './options-panel-complexity-filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OptionsPanelComplexityFilterComponent {
  readonly minDeps = input.required<number>();
  readonly maxDeps = input.required<number>();
  readonly maxDetectedDeps = input.required<number>();

  readonly updateMinDeps = output<number>();
}
