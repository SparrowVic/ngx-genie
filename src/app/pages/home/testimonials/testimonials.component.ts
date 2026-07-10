import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../../../core/services/content.service';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { GlassPanelComponent } from '../../../shared/ui/glass-panel/glass-panel.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { InitialsPipe } from '../../../core/pipes/initials.pipe';

/**
 * app-testimonials — social proof. Renders ContentService.testimonials() as a
 * grid of glass quote cards, each with an accent-ringed initials avatar and a
 * subtle 3D tilt supplied by the interactive glass panel.
 */
@Component({
  selector: 'app-testimonials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './testimonials.component.html',
  styleUrl: './testimonials.component.scss',
  imports: [
    SectionHeaderComponent,
    GlassPanelComponent,
    IconComponent,
    RevealOnScrollDirective,
    InitialsPipe,
  ],
})
export class TestimonialsComponent {
  private readonly content = inject(ContentService);

  /** The endorsements sourced from editorial content. */
  readonly testimonials = this.content.testimonials;

  /** Every card renders a full five-star rating. */
  readonly stars = [0, 1, 2, 3, 4];

  /** Count surfaced in the eyebrow copy. */
  readonly count = computed(() => this.testimonials().length);
}
