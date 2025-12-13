import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';

@Component({
  selector: 'lib-constellation-mode-switch',
  standalone: true,
  imports: [],
  templateUrl: './constellation-mode-switch.component.html',
  styleUrl: './constellation-mode-switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstellationModeSwitchComponent {
  readonly active = input.required<boolean>();
  readonly toggle = output<void>();
}
