import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvancedConfigStore } from '../../advanced-config.store';
import { GicTokenRowComponent } from '../gic-token-row/gic-token-row.component';

@Component({
  standalone: true,
  selector: 'gic-tokens-tab',
  imports: [FormsModule, GicTokenRowComponent],
  templateUrl: './gic-tokens-tab.component.html',
  styleUrl: './gic-tokens-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GicTokensTabComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
