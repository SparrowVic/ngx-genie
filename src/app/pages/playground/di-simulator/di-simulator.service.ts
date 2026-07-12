import { Injectable, computed, signal } from '@angular/core';
import { NodeKind, ProviderScope } from '../../../core/models/constellation.model';

/** A mock provider row the simulator lets you add, scope and remove. */
export interface FakeProvider {
  readonly id: number;
  readonly name: string;
  readonly kind: NodeKind;
  readonly scope: ProviderScope;
}

/** Static metadata for each injector scope — label, blurb and accent colour. */
export interface ScopeMeta {
  readonly scope: ProviderScope;
  readonly label: string;
  readonly icon: string;
  readonly accent: string;
}

export const SCOPE_META: readonly ScopeMeta[] = [
  { scope: 'root', label: 'Root', icon: 'sitemap', accent: 'var(--violet)' },
  { scope: 'element', label: 'Element', icon: 'layers', accent: 'var(--cyan)' },
  { scope: 'platform', label: 'Platform', icon: 'cpu', accent: 'var(--amber)' },
];

/**
 * DiSimulatorService — a component-provided store of pretend providers. Because
 * it (and the FakeProvider list it holds) lives on the DiSimulatorComponent's
 * own element injector, the GenieOS overlay renders it beneath that component
 * rather than at the application root — exactly the root-vs-element contrast the
 * playground is here to demonstrate.
 */
@Injectable()
export class DiSimulatorService {
  private seq = 0;

  private readonly _providers = signal<FakeProvider[]>([
    this.make('LoggerService', 'service', 'root'),
    this.make('TooltipDirective', 'directive', 'element'),
    this.make('APP_CONFIG', 'token', 'platform'),
    this.make('CurrencyPipe', 'pipe', 'root'),
  ]);
  readonly providers = this._providers.asReadonly();

  readonly count = computed(() => this._providers().length);

  /** Per-scope tallies — each is its own computed the inspector can watch. */
  readonly rootCount = computed(() => this.countScope('root'));
  readonly elementCount = computed(() => this.countScope('element'));
  readonly platformCount = computed(() => this.countScope('platform'));

  /** The scope holding the most providers right now. */
  readonly dominantScope = computed<ProviderScope>(() => {
    const tallies: Array<[ProviderScope, number]> = [
      ['root', this.rootCount()],
      ['element', this.elementCount()],
      ['platform', this.platformCount()],
    ];
    return tallies.sort((a, b) => b[1] - a[1])[0][0];
  });

  add(input: { name: string; kind: NodeKind; scope: ProviderScope }): void {
    const name = input.name.trim() || this.fallbackName(input.kind);
    this._providers.update((list) => [...list, this.make(name, input.kind, input.scope)]);
  }

  remove(id: number): void {
    this._providers.update((list) => list.filter((p) => p.id !== id));
  }

  reset(): void {
    this._providers.set([]);
  }

  accentFor(scope: ProviderScope): string {
    return SCOPE_META.find((m) => m.scope === scope)?.accent ?? 'var(--violet)';
  }

  private countScope(scope: ProviderScope): number {
    return this._providers().filter((p) => p.scope === scope).length;
  }

  private make(name: string, kind: NodeKind, scope: ProviderScope): FakeProvider {
    return { id: ++this.seq, name, kind, scope };
  }

  private fallbackName(kind: NodeKind): string {
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    return `Untitled${label}`;
  }
}
