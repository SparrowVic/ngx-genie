import {ChangeDetectionStrategy, Component, input, output, signal, ViewEncapsulation} from '@angular/core';
import {FormsModule} from '@angular/forms';


@Component({
  selector: 'lib-options-panel-provider-types',
  standalone: true,
  imports: [
    FormsModule
],
  templateUrl: './options-panel-provider-types.component.html',
  styleUrl: './options-panel-provider-types.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OptionsPanelProviderTypesComponent {

  readonly activeTab = signal<'user' | 'framework'>('user');

  readonly showUserServices = input.required<boolean>();
  readonly showUserTokens = input.required<boolean>();
  readonly showUserValues = input.required<boolean>();
  readonly showUserObservables = input.required<boolean>();
  readonly showUserSignals = input.required<boolean>();
  readonly showUserComponents = input.required<boolean>();
  readonly showUserDirectives = input.required<boolean>();
  readonly showUserPipes = input.required<boolean>();

  readonly updateUserServices = output<boolean>();
  readonly updateUserTokens = output<boolean>();
  readonly updateUserValues = output<boolean>();
  readonly updateUserObservables = output<boolean>();
  readonly updateUserSignals = output<boolean>();
  readonly updateUserComponents = output<boolean>();
  readonly updateUserDirectives = output<boolean>();
  readonly updateUserPipes = output<boolean>();

  readonly showFrameworkServices = input.required<boolean>();
  readonly showFrameworkSystem = input.required<boolean>();
  readonly showFrameworkTokens = input.required<boolean>();
  readonly showFrameworkObservables = input.required<boolean>();
  readonly showFrameworkSignals = input.required<boolean>();
  readonly showFrameworkComponents = input.required<boolean>();
  readonly showFrameworkDirectives = input.required<boolean>();
  readonly showFrameworkPipes = input.required<boolean>();

  readonly updateFrameworkServices = output<boolean>();
  readonly updateFrameworkSystem = output<boolean>();
  readonly updateFrameworkTokens = output<boolean>();
  readonly updateFrameworkObservables = output<boolean>();
  readonly updateFrameworkSignals = output<boolean>();
  readonly updateFrameworkComponents = output<boolean>();
  readonly updateFrameworkDirectives = output<boolean>();
  readonly updateFrameworkPipes = output<boolean>();

  setActiveTab(tab: 'user' | 'framework') {
    this.activeTab.set(tab);
  }
}
