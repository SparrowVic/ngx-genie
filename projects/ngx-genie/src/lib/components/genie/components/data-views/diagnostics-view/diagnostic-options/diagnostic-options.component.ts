import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DiagnosticsConfig} from '../../../../../../services/genie-diagnostics.service';

@Component({
  selector: 'lib-diagnostic-options',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './diagnostic-options.component.html',
  styleUrl: './diagnostic-options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class DiagnosticOptionsComponent {
  config = input.required<DiagnosticsConfig>();
  configChange = output<DiagnosticsConfig>();

  updateConfig(key: keyof DiagnosticsConfig, value: any) {
    this.configChange.emit({
      ...this.config(),
      [key]: value
    });
  }
}
