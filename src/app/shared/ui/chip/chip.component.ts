import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * ui-chip — a small accent-tinted pill for tags, categories and metadata.
 * The accent colour drives the border, tint and (optional) icon colour via a
 * single CSS custom property.
 */
@Component({
  standalone: true,
  selector: 'ui-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chip.component.html',
  styleUrl: './chip.component.scss',
  imports: [IconComponent],
})
export class ChipComponent {
  readonly icon = input<string>();
  readonly accent = input('var(--violet)');

  /** True when an icon glyph should render ahead of the label. */
  readonly hasIcon = computed(() => !!this.icon());
}
