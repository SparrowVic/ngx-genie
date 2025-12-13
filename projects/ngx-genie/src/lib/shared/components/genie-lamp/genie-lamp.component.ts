import {ChangeDetectionStrategy, Component} from '@angular/core';
import {GENIE_ICONS} from '../../../resources/icons/icons';
import {SvgIconDirective} from '../../directives/svg-icon/svg-icon.directive';

@Component({
  selector: 'lib-ngx-genie-lamp',
  standalone: true,
  imports: [
    SvgIconDirective
  ],
  templateUrl: './genie-lamp.component.html',
  styleUrl: './genie-lamp.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenieLampComponent {
  readonly GENIE_LAMP = GENIE_ICONS.GENIE_LAMP;
}
