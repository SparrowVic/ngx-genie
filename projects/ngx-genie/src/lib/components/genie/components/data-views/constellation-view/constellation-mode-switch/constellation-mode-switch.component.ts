import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';

@Component({
  standalone: true,
  selector: 'lib-constellation-mode-switch',
  imports: [],
  templateUrl: './constellation-mode-switch.component.html',
  styleUrl: './constellation-mode-switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class ConstellationModeSwitchComponent {
  readonly active = input.required<boolean>();
  readonly toggle = output<void>();
}
