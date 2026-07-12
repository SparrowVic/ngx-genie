import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { DiSimulatorService, SCOPE_META } from './di-simulator.service';
import { NodeKind, ProviderScope } from '../../../core/models/constellation.model';
import { NotificationService } from '../../../core/services/notification.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { StatComponent } from '../../../shared/ui/stat/stat.component';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/** Icon shown alongside each provider kind. */
const KIND_ICONS: Record<NodeKind, string> = {
  service: 'settings',
  component: 'grid',
  token: 'sparkles',
  directive: 'zap',
  pipe: 'recycle',
};

/**
 * app-di-simulator — a build-your-own injector, backed by a component-scoped
 * DiSimulatorService. Add mock providers with a kind + scope + name, watch the
 * per-scope tallies recompute in real time, and remove them again. Every provider
 * you add lives on *this* component's element injector, so GenieOS (F1) shows it
 * nested here — not up at the application root.
 */
@Component({
  selector: 'app-di-simulator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DiSimulatorService],
  imports: [IconComponent, ButtonComponent, ChipComponent, StatComponent, PluralizePipe],
  templateUrl: './di-simulator.component.html',
  styleUrl: './di-simulator.component.scss',
})
export class DiSimulatorComponent {
  protected readonly sim = inject(DiSimulatorService);
  private readonly notifications = inject(NotificationService);

  /** The kinds and scopes offered in the two <select>s. */
  readonly kinds: readonly NodeKind[] = ['service', 'component', 'token', 'directive', 'pipe'];
  readonly scopes = SCOPE_META;

  /** Draft provider being composed by the add controls. */
  readonly draftName = model('');
  readonly draftKind = signal<NodeKind>('service');
  readonly draftScope = signal<ProviderScope>('root');

  /** Whether the current draft would create a named (vs auto-named) provider. */
  readonly hasName = computed(() => this.draftName().trim().length > 0);

  readonly kindIcon = computed(() => KIND_ICONS[this.draftKind()]);

  readonly isEmpty = computed(() => this.sim.count() === 0);

  onKindChange(event: Event): void {
    this.draftKind.set((event.target as HTMLSelectElement).value as NodeKind);
  }

  onScopeChange(event: Event): void {
    this.draftScope.set((event.target as HTMLSelectElement).value as ProviderScope);
  }

  add(): void {
    this.sim.add({
      name: this.draftName().trim(),
      kind: this.draftKind(),
      scope: this.draftScope(),
    });
    this.draftName.set('');
  }

  remove(id: number): void {
    this.sim.remove(id);
  }

  reset(): void {
    this.sim.reset();
    this.notifications.push({
      title: 'Injector cleared',
      message: 'All simulated providers were removed.',
      tone: 'warn',
      icon: 'recycle',
    });
  }

  iconFor(kind: NodeKind): string {
    return KIND_ICONS[kind];
  }
}
