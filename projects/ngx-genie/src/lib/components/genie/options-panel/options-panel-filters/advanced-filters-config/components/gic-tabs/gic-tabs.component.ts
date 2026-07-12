import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { AdvancedConfigStore } from '../../advanced-config.store';

@Component({
  selector: 'gic-tabs',
  imports: [],
  templateUrl: './gic-tabs.component.html',
  styleUrl: './gic-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicTabsComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
