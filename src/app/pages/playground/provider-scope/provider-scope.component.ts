import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ProviderScope } from '../../../core/models/constellation.model';
import { GlassPanelComponent } from '../../../shared/ui/glass-panel/glass-panel.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';

/** One injector scope, explained. */
interface ScopeCard {
  readonly scope: ProviderScope;
  readonly title: string;
  readonly icon: string;
  readonly accent: string;
  readonly lifetime: string;
  readonly note: string;
  readonly example: string;
}

/**
 * app-provider-scope — a compact primer on Angular's three injector scopes.
 * Three stacked glass cards (root / element / platform), each accent-tinted, with
 * a one-line explanation and a real-world example. Clicking a card promotes it so
 * you can compare where a provider lives — the same distinction GenieOS draws in
 * the DI graph when you press F1.
 */
@Component({
  selector: 'app-provider-scope',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlassPanelComponent, IconComponent, ChipComponent],
  templateUrl: './provider-scope.component.html',
  styleUrl: './provider-scope.component.scss',
})
export class ProviderScopeComponent {
  readonly cards: readonly ScopeCard[] = [
    {
      scope: 'platform',
      title: 'Platform injector',
      icon: 'cpu',
      accent: 'var(--amber)',
      lifetime: 'Whole platform',
      note: 'The outermost injector, shared across every Angular app bootstrapped on the page. Rare in practice — reserved for platform-level primitives.',
      example: 'providedIn: "platform"',
    },
    {
      scope: 'root',
      title: 'Root injector',
      icon: 'sitemap',
      accent: 'var(--violet)',
      lifetime: 'Application-wide',
      note: 'One shared singleton for the entire application. Where the vast majority of services live — tree-shakable and instantiated lazily on first use.',
      example: 'providedIn: "root"',
    },
    {
      scope: 'element',
      title: 'Element injector',
      icon: 'layers',
      accent: 'var(--cyan)',
      lifetime: 'Per component',
      note: 'Created for a component (or directive) via its providers array. A fresh instance per component instance — perfect for scoped, disposable state.',
      example: 'providers: [Store]',
    },
  ];

  /** The card currently promoted to the foreground. */
  private readonly _activeScope = signal<ProviderScope>('element');
  readonly activeScope = this._activeScope.asReadonly();

  readonly active = computed(
    () => this.cards.find((c) => c.scope === this._activeScope()) ?? this.cards[0],
  );

  readonly hint = computed(
    () =>
      `The Signal lab and DI simulator above both use ${this.active().title.toLowerCase()}s.`,
  );

  select(scope: ProviderScope): void {
    this._activeScope.set(scope);
  }

  isActive(scope: ProviderScope): boolean {
    return this._activeScope() === scope;
  }
}
