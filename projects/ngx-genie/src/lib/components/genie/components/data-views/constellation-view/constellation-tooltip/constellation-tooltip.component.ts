import {ChangeDetectionStrategy, Component, input, ViewEncapsulation} from '@angular/core';
import {RenderNode} from '../models/constellation.models';

@Component({
  selector: 'lib-constellation-tooltip',
  imports: [],
  templateUrl: './constellation-tooltip.component.html',
  styleUrl: './constellation-tooltip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class ConstellationTooltipComponent {
  readonly node = input.required<RenderNode | null>();
  readonly x = input.required<number>();
  readonly y = input.required<number>();
}
