import {ChangeDetectionStrategy, Component, input, output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';

export interface MatrixSettings {
  rain: boolean;
  animation: boolean;
}

@Component({
  selector: 'lib-matrix-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matrix-settings.component.html',
  styleUrl: './matrix-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
