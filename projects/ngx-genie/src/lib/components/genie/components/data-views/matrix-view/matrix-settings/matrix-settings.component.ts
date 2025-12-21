import {ChangeDetectionStrategy, Component, input, output, signal, ViewEncapsulation} from '@angular/core';


export interface MatrixSettings {
  rain: boolean;
  animation: boolean;
}

@Component({
  selector: 'lib-matrix-settings',
  standalone: true,
  imports: [],
  templateUrl: './matrix-settings.component.html',
  styleUrl: './matrix-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MatrixSettingsComponent {
  readonly settings = input.required<MatrixSettings>();
  readonly settingsChange = output<MatrixSettings>();
  readonly resetLayout = output<void>();

  readonly collapsed = signal(true);

  toggleCollapsed() {
    this.collapsed.update(v => !v);
  }

  toggle(key: keyof MatrixSettings) {
    const current = this.settings();
    const newSettings = {...current, [key]: !current[key]};
    this.settingsChange.emit(newSettings);
  }
}
