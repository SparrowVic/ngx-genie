import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  input,
} from '@angular/core';
import { AdvancedConfigStore, FilterRule } from '../../advanced-config.store';

@Component({
  standalone: true,
  selector: 'gic-rule-card',
  imports: [],
  templateUrl: './gic-rule-card.component.html',
  styleUrl: './gic-rule-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicRuleCardComponent {
  protected readonly store = inject(AdvancedConfigStore);

  readonly rule = input.required<FilterRule>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();

  protected readonly matchCount = computed(() => this.store.ruleMatchCount(this.rule()));
  protected readonly flashed = computed(() => this.store.flashRuleId() === this.rule().id);
}
