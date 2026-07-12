import { Injectable, computed, inject, signal } from '@angular/core';
import { FeatureId, GenieFeature } from '../models/feature.model';
import { HotkeyService } from './hotkey.service';

/**
 * Source of truth for the six GenieOS inspector features. Exposes the list plus
 * a selection signal so the features page / spotlight can drive off one store.
 */
@Injectable({ providedIn: 'root' })
export class FeatureCatalogService {
  private readonly hotkey = inject(HotkeyService);

  // Feature demo snippets mention the overlay hotkey (e.g. `provideGenie({ hotkey: "F1" })`,
  // `F1 → Constellation`); rewrite the literal `F1` to the app's configured key.
  private readonly _features = computed<GenieFeature[]>(() =>
    FEATURES.map((f) =>
      f.demo.includes('F1') ? { ...f, demo: f.demo.replace('F1', this.hotkey.key) } : f,
    ),
  );
  readonly features = this._features;

  private readonly _selectedId = signal<FeatureId>('constellation');
  readonly selectedId = this._selectedId.asReadonly();

  readonly selected = computed(
    () => this._features().find((f) => f.id === this._selectedId()) ?? this._features()[0],
  );
  readonly count = computed(() => this._features().length);

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
    icon: 'sitemap', accent: 'var(--indigo)',
    bullets: ['Element vs Environment injectors', 'Lazy & dynamic components', 'Deep-focus a single branch'],
    stats: [{ label: 'Injector kinds', value: 2 }, { label: 'Provider types', value: 9 }],
    demo: 'provideGenie({ hotkey: "F1" })',
    media: {
      src: '/media/tree-view.png', width: 1600, height: 1000,
      alt: "GenieOS Tree view inspecting this site's injector graph, with the Data Inspector populated",
      caption: "The Tree view walking this site's own injector graph, Data Inspector open.",
    },
  },
  {
    id: 'org-chart', name: 'Org Chart', tagline: 'Parent → child at a glance',
    description: 'Your application structure rendered as a classic organisational chart so parent-child provider relationships read instantly.',
    icon: 'hierarchy', accent: 'var(--cyan)',
    bullets: ['Collapsible branches', 'Provider slots per node', 'Large-graph summarisation'],
    stats: [{ label: 'Provider types', value: 9 }, { label: 'Injector kinds', value: 2 }],
    demo: '<ngx-genie />',
    media: {
      src: '/media/org-chart-view.png', width: 1600, height: 1000,
      alt: "GenieOS Org Chart view of this site's parent–child injector hierarchy",
      caption: 'Parent → child injectors across this site — 230 live nodes.',
    },
  },
  {
    id: 'matrix', name: 'Matrix View', tagline: 'Dependencies as a grid',
    description: 'A powerful dependency matrix computed inside a Web Worker, keeping the host app perfectly responsive.',
    icon: 'grid', accent: 'var(--emerald)',
    bullets: ['Web Worker powered', 'Coupling heatmap', 'Off the main thread'],
    stats: [{ label: 'Compute', value: 'Web Worker' }, { label: 'Provider types', value: 9 }],
    demo: 'worker.postMessage(graph)',
    media: {
      src: '/media/matrix-view.png', width: 1600, height: 1000,
      alt: "GenieOS Matrix view showing this site's dependency grid",
      caption: "This site's dependency matrix, computed off the main thread.",
    },
  },
  {
    id: 'constellation', name: 'Constellation', tagline: 'The dependency universe',
    description: 'An interactive force-directed graph that presents your dependency network as a living constellation of nodes and links.',
    icon: 'sparkles', accent: 'var(--violet)',
    bullets: ['Force-directed layout', 'Flow & orbit modes', 'Huge-graph safety modes'],
    stats: [{ label: 'Layout', value: 'Force-directed' }, { label: 'Compute', value: 'Web Worker' }],
    demo: 'F1 → Constellation',
    media: {
      src: '/media/constellation-view.png', width: 1600, height: 1000,
      alt: "GenieOS Constellation view of this site's dependency graph, with System Controls open",
      caption: 'This site as a constellation — 230 nodes and 1,499 services, live.',
    },
  },
  {
    id: 'diagnostics', name: 'Diagnostics', tagline: 'Anomalies, surfaced',
    description: 'Automatic detection of circular dependencies, singleton violations, heavy state and default change-detection hot spots.',
    icon: 'shield', accent: 'var(--amber)',
    bullets: ['Circular dependency alerts', 'Heavy-state heuristics', 'Coupling score'],
    stats: [{ label: 'Checks', value: 8 }, { label: 'Severity levels', value: 3 }],
    demo: 'diagnostics.runAll()',
    media: {
      src: '/media/diagnostics-view.png', width: 1600, height: 1000,
      alt: 'GenieOS Diagnostics view showing System Health results for this site',
      caption: 'System Health running all 8 checks against this site.',
    },
  },
  {
    id: 'inspector', name: 'Live Inspector', tagline: 'Signals & observables, live',
    description: 'Real-time inspection of service state — including Signals and Observable values — with a normalized JSON tree.',
    icon: 'radar', accent: 'var(--magenta)',
    bullets: ['Signal value peeking', 'Observable snapshots', 'Weak-ref, leak-free'],
    stats: [{ label: 'Live values', value: 'Signals' }, { label: 'Snapshots', value: 'Observables' }],
    demo: 'inspect(MyService)',
    media: {
      src: '/media/inspector-panel.png', width: 408, height: 1000,
      alt: 'GenieOS Inspector panel showing live Signal and Observable values from this site',
      caption: 'The Inspector panel reading live Signal and Observable values.',
    },
  },
];
