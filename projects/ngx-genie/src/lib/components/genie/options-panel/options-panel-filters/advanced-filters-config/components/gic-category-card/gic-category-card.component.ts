import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, input } from '@angular/core';

import { AdvancedConfigStore, InternalCategory } from '../../advanced-config.store';

@Component({
  selector: 'gic-category-card',
  templateUrl: './gic-category-card.component.html',
  styleUrl: './gic-category-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicCategoryCardComponent {
  protected readonly store = inject(AdvancedConfigStore);

  readonly category = input.required<InternalCategory>();
}
