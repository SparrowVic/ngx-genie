import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'lib-options-panel-scope-lifetime',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './options-panel-scope-lifetime.component.html',
  styleUrl: './options-panel-scope-lifetime.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OptionsPanelScopeLifetimeComponent {
  readonly showRootOnly = input.required<boolean>();
  readonly showLocalOnly = input.required<boolean>();

  readonly updateShowRootOnly = output<boolean>();
  readonly updateShowLocalOnly = output<boolean>();
}
