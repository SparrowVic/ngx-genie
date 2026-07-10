import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvancedConfigStore } from '../../advanced-config.store';

@Component({
  selector: 'gic-io-panel',
  imports: [FormsModule],
  templateUrl: './gic-io-panel.component.html',
  styleUrl: './gic-io-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicIoPanelComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
