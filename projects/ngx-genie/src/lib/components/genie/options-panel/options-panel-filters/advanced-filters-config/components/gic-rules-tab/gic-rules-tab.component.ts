import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvancedConfigStore } from '../../advanced-config.store';
import { GicRuleCardComponent } from '../gic-rule-card/gic-rule-card.component';

@Component({
  selector: 'gic-rules-tab',
  imports: [FormsModule, GicRuleCardComponent],
  templateUrl: './gic-rules-tab.component.html',
  styleUrl: './gic-rules-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicRulesTabComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
