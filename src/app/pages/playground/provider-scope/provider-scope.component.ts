import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ProviderScope } from '../../../core/models/constellation.model';
import { HotkeyService } from '../../../core/services/hotkey.service';
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
  /** Lede shown while this card is promoted — ties the scope back to this page. */
  readonly hint: string;
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
  protected readonly hotkey = inject(HotkeyService);

  readonly cards: readonly ScopeCard[] = [
    {
      scope: 'platform',
      title: 'Platform injector',
      icon: 'cpu',
      accent: 'var(--amber)',
      lifetime: 'Whole platform',
      note: 'The outermost injector, shared across every Angular app bootstrapped on the page. Rare in practice — reserved for platform-level primitives.',
      example: 'providedIn: "platform"',
      hint: 'Nothing on this page is platform-scoped — it exists for primitives shared by every Angular app on the page.',
    },
    {
      scope: 'root',
      title: 'Root injector',
      icon: 'sitemap',
      accent: 'var(--violet)',
      lifetime: 'Application-wide',
      note: 'One shared singleton for the entire application. Where the vast majority of services live — tree-shakable and instantiated lazily on first use.',
      example: 'providedIn: "root"',
      hint: 'This site’s app-wide services — content, notifications, theme — are root singletons shared by every page.',
    },
    {
      scope: 'element',
      title: 'Element injector',
      icon: 'layers',
      accent: 'var(--cyan)',
      lifetime: 'Per component',
      note: 'Created for a component (or directive) via its providers array. A fresh instance per component instance — perfect for scoped, disposable state.',
      example: 'providers: [Store]',
      hint: 'The Signal lab and DI simulator above both sit on element injectors — their stores live and die with their components.',
    },
  ];

  /** The card currently promoted to the foreground. */
  private readonly _activeScope = signal<ProviderScope>('element');
  readonly activeScope = this._activeScope.asReadonly();

  readonly active = computed(
    () => this.cards.find((c) => c.scope === this._activeScope()) ?? this.cards[0],
  );

  readonly hint = computed(() => this.active().hint);

  select(scope: ProviderScope): void {
    this._activeScope.set(scope);
  }

  isActive(scope: ProviderScope): boolean {
    return this._activeScope() === scope;
  }
}
