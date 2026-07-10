import { Injectable, computed, signal } from '@angular/core';
import { FeatureId, GenieFeature } from '../models/feature.model';

/**
 * Source of truth for the six GenieOS inspector features. Exposes the list plus
 * a selection signal so the features page / spotlight can drive off one store.
 */
@Injectable({ providedIn: 'root' })
export class FeatureCatalogService {
  private readonly _features = signal<GenieFeature[]>(FEATURES);
  readonly features = this._features.asReadonly();

  private readonly _selectedId = signal<FeatureId>('constellation');
  readonly selectedId = this._selectedId.asReadonly();

  readonly selected = computed(
    () => this._features().find((f) => f.id === this._selectedId()) ?? this._features()[0],
  );
  readonly count = computed(() => this._features().length);
  readonly totalStats = computed(() =>
    this._features().reduce((sum, f) => sum + f.stats.length, 0),
  );

  select(id: FeatureId): void {
    this._selectedId.set(id);
  }

  byId(id: FeatureId): GenieFeature | undefined {
    return this._features().find((f) => f.id === id);
  }
}

const FEATURES: GenieFeature[] = [
  {
    id: 'tree', name: 'Injector Tree', tagline: 'Hierarchy, decoded',
    description: 'A hierarchical view of the component tree and its Element & Environment injectors, resolved live from the running app.',
    icon: 'sitemap', accent: 'var(--indigo)', since: '17.0',
    bullets: ['Element vs Environment injectors', 'Lazy & dynamic components', 'Deep-focus a single branch'],
    stats: [{ label: 'Nodes / scan', value: 4200 }, { label: 'Resolve time', value: 8, unit: 'ms' }],
    demo: 'provideGenie({ hotkey: "F1" })',
  },
  {
    id: 'org-chart', name: 'Org Chart', tagline: 'Parent → child at a glance',
    description: 'Your application structure rendered as a classic organisational chart so parent-child provider relationships read instantly.',
    icon: 'hierarchy', accent: 'var(--cyan)', since: '18.0',
    bullets: ['Collapsible branches', 'Provider slots per node', 'Large-graph summarisation'],
    stats: [{ label: 'Max nodes', value: 12000 }, { label: 'Render', value: 60, unit: 'fps' }],
    demo: '<ngx-genie />',
  },
  {
    id: 'matrix', name: 'Matrix View', tagline: 'Dependencies as a grid',
    description: 'A powerful dependency matrix computed inside a Web Worker, keeping the host app perfectly responsive.',
    icon: 'grid', accent: 'var(--emerald)', since: '18.0',
    bullets: ['Web Worker powered', 'Coupling heatmap', 'Zero main-thread cost'],
    stats: [{ label: 'Cells', value: 250000 }, { label: 'Worker', value: 1 }],
    demo: 'worker.postMessage(graph)',
  },
  {
    id: 'constellation', name: 'Constellation', tagline: 'The dependency universe',
    description: 'An interactive force-directed graph that presents your dependency network as a living constellation of nodes and links.',
    icon: 'sparkles', accent: 'var(--violet)', since: '20.0',
    bullets: ['Force-directed layout', 'Flow & orbit modes', 'Huge-graph safety modes'],
    stats: [{ label: 'Nodes', value: 5000 }, { label: 'Modes', value: 3 }],
    demo: 'F1 → Constellation',
  },
  {
    id: 'diagnostics', name: 'Diagnostics', tagline: 'Anomalies, surfaced',
    description: 'Automatic detection of circular dependencies, singleton violations, heavy state and default change-detection hot spots.',
    icon: 'shield', accent: 'var(--amber)', since: '20.0',
    bullets: ['Circular dependency alerts', 'Heavy-state heuristics', 'Coupling score'],
    stats: [{ label: 'Checks', value: 12 }, { label: 'Severity levels', value: 3 }],
    demo: 'diagnostics.runAll()',
  },
  {
    id: 'inspector', name: 'Live Inspector', tagline: 'Signals & observables, live',
    description: 'Real-time inspection of service state — including Signals and Observable values — with a normalized JSON tree.',
    icon: 'radar', accent: 'var(--magenta)', since: '20.0',
    bullets: ['Signal value peeking', 'Observable snapshots', 'Weak-ref, leak-free'],
    stats: [{ label: 'Watched', value: 1284 }, { label: 'Overhead', value: 0, unit: 'ms' }],
    demo: 'inspect(MyService)',
  },
];
