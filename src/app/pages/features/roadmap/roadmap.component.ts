import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../../../core/services/content.service';
import { RoadmapPhase } from '../../../core/models/content.model';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

type RoadmapStatus = RoadmapPhase['status'];

interface StatusMeta {
  readonly label: string;
  readonly accent: string;
  readonly icon: string;
}

interface PhaseView extends RoadmapPhase {
  readonly meta: StatusMeta;
  readonly doneCount: number;
  readonly total: number;
  readonly percent: number;
}

/**
 * app-roadmap — the delivery timeline for GenieOS. ContentService.roadmap() is
 * projected as three status-coloured phases connected by a vertical spine, each
 * with a completion meter and a check/circle checklist.
 */
@Component({
  standalone: true,
  selector: 'app-roadmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roadmap.component.html',
  styleUrl: './roadmap.component.scss',
  imports: [
    IconComponent,
    ChipComponent,
    SectionHeaderComponent,
    RevealOnScrollDirective,
    PluralizePipe,
  ],
})
export class RoadmapComponent {
  private readonly content = inject(ContentService);

  readonly phases = this.content.roadmap;

  private readonly statusMeta: Record<RoadmapStatus, StatusMeta> = {
    shipped: { label: 'Shipped', accent: 'var(--emerald)', icon: 'check' },
    'in-progress': { label: 'In progress', accent: 'var(--cyan)', icon: 'bolt' },
    planned: { label: 'Planned', accent: 'var(--violet)', icon: 'sparkles' },
  };

  /** Enrich each phase with its status metadata and completion figures. */
  readonly phaseViews = computed<PhaseView[]>(() =>
    this.phases().map((phase) => {
      const doneCount = phase.items.filter((item) => item.done).length;
      const total = phase.items.length;
      return {
        ...phase,
        meta: this.statusMeta[phase.status],
        doneCount,
        total,
        percent: total > 0 ? Math.round((doneCount / total) * 100) : 0,
      };
    }),
  );

  /** Total items already shipped across every phase — a headline figure. */
  readonly shippedTotal = computed(() =>
    this.phaseViews().reduce((sum, phase) => sum + phase.doneCount, 0),
  );
}
