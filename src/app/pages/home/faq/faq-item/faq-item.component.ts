import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FaqItem } from '../../../../core/models/content.model';
import { ChipComponent } from '../../../../shared/ui/chip/chip.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { HighlightPipe } from '../../../../core/pipes/highlight.pipe';

/**
 * app-faq-item — a single accordion row. The question and answer are rendered
 * through the highlight pipe so the active search query is emphasised, and the
 * expanded body is revealed with an animated open transition.
 */
@Component({
  selector: 'app-faq-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, IconComponent, HighlightPipe],
  templateUrl: './faq-item.component.html',
  styleUrl: './faq-item.component.scss',
})
export class FaqItemComponent {
  readonly item = input.required<FaqItem>();
  readonly query = input('');

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((value) => !value);
  }
}
