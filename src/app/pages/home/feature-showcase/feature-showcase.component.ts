import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FeatureCatalogService } from '../../../core/services/feature-catalog.service';
import { FeatureId } from '../../../core/models/feature.model';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { FeatureCardComponent } from './feature-card/feature-card.component';
import { FeatureSpotlightComponent } from './feature-spotlight/feature-spotlight.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/**
 * app-feature-showcase — the six GenieOS inspector views. A vertical list of
 * selectable feature cards on the left drives the shared FeatureCatalogService
 * selection; the spotlight on the right expands the active view. Tracks which
 * views the visitor has explored via an effect for a subtle progress meter.
 */
@Component({
  standalone: true,
  selector: 'app-feature-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionHeaderComponent,
    ChipComponent,
    FeatureCardComponent,
    FeatureSpotlightComponent,
    RevealOnScrollDirective,
    PluralizePipe,
  ],
  templateUrl: './feature-showcase.component.html',
  styleUrl: './feature-showcase.component.scss',
})
export class FeatureShowcaseComponent {
  protected readonly catalog = inject(FeatureCatalogService);

  private readonly _viewed = signal<ReadonlySet<FeatureId>>(
    new Set<FeatureId>([this.catalog.selectedId()]),
  );
  readonly viewedCount = computed(() => this._viewed().size);
  readonly exploredAll = computed(() => this.viewedCount() >= this.catalog.count());

  constructor() {
    // Remember every view the visitor lands on to drive the progress chip.
    effect(() => {
      const id = this.catalog.selectedId();
      this._viewed.update((seen) => (seen.has(id) ? seen : new Set(seen).add(id)));
    }, {allowSignalWrites: true});
  }

  select(id: FeatureId): void {
    this.catalog.select(id);
  }
}
