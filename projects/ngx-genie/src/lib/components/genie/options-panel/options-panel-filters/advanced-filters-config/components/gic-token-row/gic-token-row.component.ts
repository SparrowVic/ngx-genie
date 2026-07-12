import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvancedConfigStore, TokenRow } from '../../advanced-config.store';

@Component({
  standalone: true,
  selector: 'gic-token-row',
  imports: [FormsModule],
  templateUrl: './gic-token-row.component.html',
  styleUrl: './gic-token-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicTokenRowComponent {
  protected readonly store = inject(AdvancedConfigStore);

  readonly item = input.required<TokenRow>();
}
