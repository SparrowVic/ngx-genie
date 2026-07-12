import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ContentService } from '../../../core/services/content.service';
import { FaqItem } from '../../../core/models/content.model';
import { FaqItemComponent } from './faq-item/faq-item.component';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/**
 * app-faq — a searchable, tag-filtered FAQ. A tag row and a free-text query both
 * feed a single computed() view of the questions, and the live query is passed
 * down to each row so matches are highlighted in place.
 */
@Component({
  standalone: true,
  selector: 'app-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FaqItemComponent,
    SectionHeaderComponent,
    ChipComponent,
    IconComponent,
    RevealOnScrollDirective,
    PluralizePipe,
  ],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
})
export class FaqComponent {
  private readonly content = inject(ContentService);

  private readonly accents = [
    'var(--cyan)',
    'var(--indigo)',
    'var(--violet)',
    'var(--magenta)',
    'var(--amber)',
    'var(--emerald)',
  ];

  readonly tags = this.content.faqTags;
  readonly selectedTag = signal('All');
  readonly query = signal('');

  /** The questions that match both the active tag and the search query. */
  readonly filtered = computed<readonly FaqItem[]>(() => {
    const tag = this.selectedTag();
    const q = this.query().trim().toLowerCase();
    return this.content.faqs().filter((faq) => {
      const matchesTag = tag === 'All' || faq.tag === tag;
      const matchesQuery =
        !q ||
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q);
      return matchesTag && matchesQuery;
    });
  });

  readonly resultCount = computed(() => this.filtered().length);
  readonly isFiltered = computed(() => this.selectedTag() !== 'All' || this.query().trim().length > 0);

  accentFor(tag: string): string {
    const index = this.tags().indexOf(tag);
    return this.accents[(index < 0 ? 0 : index) % this.accents.length];
  }

  selectTag(tag: string): void {
    this.selectedTag.set(tag);
  }

  onSearch(value: string): void {
    this.query.set(value);
  }

  reset(): void {
    this.query.set('');
    this.selectedTag.set('All');
  }
}
