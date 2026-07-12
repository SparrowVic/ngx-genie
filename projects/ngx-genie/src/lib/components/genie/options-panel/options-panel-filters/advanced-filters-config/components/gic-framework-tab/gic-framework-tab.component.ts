import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
} from '@angular/core';

import { AdvancedConfigStore } from '../../advanced-config.store';
import { GicCategoryCardComponent } from '../gic-category-card/gic-category-card.component';

@Component({
  standalone: true,
  selector: 'gic-framework-tab',
  imports: [GicCategoryCardComponent],
  templateUrl: './gic-framework-tab.component.html',
  styleUrl: './gic-framework-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicFrameworkTabComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
