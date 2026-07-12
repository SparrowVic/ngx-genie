import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface HeadingSegment {
  readonly text: string;
  readonly gradient: boolean;
}

/**
 * ui-section-header — the standard heading block for each page section: an
 * eyebrow, a display-font h2, and a subtitle. Wrap part of the heading in
 * *asterisks* to render it in the aurora gradient, e.g. "Summon your *DI graph*".
 * Projected content renders as trailing actions beneath the header.
 */
@Component({
  selector: 'ui-section-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './section-header.component.html',
  styleUrl: './section-header.component.scss',
})
export class SectionHeaderComponent {
  readonly eyebrow = input<string>();
  readonly heading = input.required<string>();
  readonly subtitle = input<string>();
  readonly align = input<'center' | 'left'>('center');

  /** Split the heading into plain and gradient segments on *…* markers. */
  readonly segments = computed<HeadingSegment[]>(() =>
    this.heading()
      // Capturing split: even indices are plain text, odd indices are the
      // gradient-highlighted captures. Keep the index before filtering empties.
      .split(/\*([^*]+)\*/g)
      .map((text, index) => ({ text, gradient: index % 2 === 1 }))
      .filter((segment) => segment.text.length > 0),
  );
}
