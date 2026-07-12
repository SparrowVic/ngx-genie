import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { AdvancedConfigStore } from '../../advanced-config.store';

@Component({
  standalone: true,
  selector: 'gic-header',
  templateUrl: './gic-header.component.html',
  styleUrl: './gic-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicHeaderComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
