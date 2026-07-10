import { Injectable, computed, signal } from '@angular/core';
import { GraphEdge, GraphModel, GraphNode, NodeKind, ProviderScope } from '../models/constellation.model';

const KINDS: readonly NodeKind[] = ['service', 'component', 'token', 'directive', 'pipe'];
const SCOPES: readonly ProviderScope[] = ['root', 'element', 'platform'];
const ACCENTS = ['var(--cyan)', 'var(--indigo)', 'var(--violet)', 'var(--magenta)', 'var(--emerald)'];
const LABELS = [
  'AppConfig', 'Router', 'HttpClient', 'ThemeService', 'AuthGuard', 'UserStore',
  'FeatureFlags', 'Telemetry', 'Logger', 'CachePool', 'FormBuilder', 'AnimationHost',
  'IconRegistry', 'ClockService', 'Notifier', 'ScrollSpy', 'GraphMapper', 'Worker',
];

/**
 * Generates the synthetic dependency graph used by the cosmic background and the
 * interactive constellation demo. Positions are normalised to a 0..1 unit box so
 * consumers can scale them into whatever canvas/SVG viewport they own.
 */
@Injectable({ providedIn: 'root' })
export class ConstellationFieldService {
  private readonly _graph = signal<GraphModel>(this.build(46));
  readonly graph = this._graph.asReadonly();

  readonly nodeCount = computed(() => this._graph().nodes.length);
  readonly edgeCount = computed(() => this._graph().edges.length);
  readonly density = computed(() => {
    const n = this.nodeCount();
    return n > 1 ? +((this.edgeCount() / (n * (n - 1) / 2)) * 100).toFixed(1) : 0;
  });

  regenerate(count = 46): void {
    this._graph.set(this.build(count));
  }

  private build(count: number): GraphModel {
    const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => {
      const kind = KINDS[i % KINDS.length];
      return {
        id: i,
        label: `${LABELS[i % LABELS.length]}${i > LABELS.length ? '_' + i : ''}`,
        kind,
        scope: SCOPES[i % SCOPES.length],
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0006,
        vy: (Math.random() - 0.5) * 0.0006,
        r: kind === 'service' ? 3.2 : kind === 'component' ? 2.6 : 2,
        accent: ACCENTS[i % ACCENTS.length],
      };
    });

    const edges: GraphEdge[] = [];
    for (let i = 1; i < count; i++) {
      const target = Math.floor(Math.random() * i);
      edges.push({ source: i, target, strength: 0.4 + Math.random() * 0.6 });
      if (i % 4 === 0 && i > 2) {
        edges.push({ source: i, target: Math.floor(Math.random() * i), strength: 0.3 });
      }
    }
    return { nodes, edges };
  }
}
