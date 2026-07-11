import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TitleCasePipe, isPlatformBrowser } from '@angular/common';
import { ConstellationFieldService } from '../../../core/services/constellation-field.service';
import { GraphEdge, GraphNode, NodeKind } from '../../../core/models/constellation.model';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/** A single simulated body: a graph node with mutable, drifting coordinates. */
interface SimNode {
  readonly id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** A node projected into viewBox space, ready to draw. */
interface NodeView {
  readonly node: GraphNode;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** An edge projected to endpoint coordinates in viewBox space. */
interface EdgeView {
  readonly edge: GraphEdge;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly accent: string;
}

interface KindLegend {
  readonly kind: NodeKind;
  readonly icon: string;
  readonly accent: string;
}

const VB_W = 160;
const VB_H = 100;
const MARGIN = 0.045;
const KIND_ICON: Record<NodeKind, string> = {
  service: 'sitemap',
  component: 'grid',
  token: 'atom',
  directive: 'bolt',
  pipe: 'layers',
};

/**
 * app-constellation-demo — an interactive, self-animating miniature of the
 * force-directed dependency graph GenieOS renders behind F1. Nodes drift on a
 * timer, hovering a node isolates it and its edges, and a live side legend
 * reports the hovered provider's identity plus the graph's makeup.
 */
@Component({
  selector: 'app-constellation-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './constellation-demo.component.html',
  styleUrl: './constellation-demo.component.scss',
  imports: [
    SectionHeaderComponent,
    ButtonComponent,
    ChipComponent,
    IconComponent,
    RevealOnScrollDirective,
    PluralizePipe,
    TitleCasePipe,
  ],
})
export class ConstellationDemoComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly field = inject(ConstellationFieldService);

  /** Currently hovered / focused node id, or null when nothing is active. */
  readonly hoveredId = signal<number | null>(null);

  /** Mutable physics state, reseeded whenever the underlying graph changes. */
  private readonly sim = signal<SimNode[]>(this.seed());

  /** Fast id → simulated position lookup for edge endpoint resolution. */
  private readonly posById = computed(() => {
    const map = new Map<number, SimNode>();
    for (const s of this.sim()) map.set(s.id, s);
    return map;
  });

  /** Nodes projected into viewBox coordinates. */
  readonly nodeViews = computed<NodeView[]>(() => {
    const positions = this.posById();
    const views: NodeView[] = [];
    for (const node of this.field.graph().nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      views.push({
        node,
        cx: p.x * VB_W,
        cy: p.y * VB_H,
        r: node.r * 0.9 + 1.1,
      });
    }
    return views;
  });

  /** id → node metadata for accent / label resolution. */
  private readonly nodeById = computed(() => {
    const map = new Map<number, GraphNode>();
    for (const node of this.field.graph().nodes) map.set(node.id, node);
    return map;
  });

  /** Edges projected to endpoint coordinates. */
  readonly edgeViews = computed<EdgeView[]>(() => {
    const positions = this.posById();
    const meta = this.nodeById();
    const views: EdgeView[] = [];
    for (const edge of this.field.graph().edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      views.push({
        edge,
        x1: a.x * VB_W,
        y1: a.y * VB_H,
        x2: b.x * VB_W,
        y2: b.y * VB_H,
        accent: meta.get(edge.source)?.accent ?? 'var(--indigo)',
      });
    }
    return views;
  });

  /** The hovered node's full metadata, if any. */
  readonly hoveredNode = computed(() => {
    const id = this.hoveredId();
    if (id === null) return null;
    return this.field.graph().nodes.find((n) => n.id === id) ?? null;
  });

  /** Ids in the hovered node's neighbourhood (itself + direct links). */
  private readonly connectedIds = computed<Set<number> | null>(() => {
    const id = this.hoveredId();
    if (id === null) return null;
    const set = new Set<number>([id]);
    for (const edge of this.field.graph().edges) {
      if (edge.source === id) set.add(edge.target);
      if (edge.target === id) set.add(edge.source);
    }
    return set;
  });

  /** Count of edges touching the hovered node — its "fan-out". */
  readonly hoveredDegree = computed(() => {
    const ids = this.connectedIds();
    return ids ? ids.size - 1 : 0;
  });

  /** Static kind → accent legend (accent tracks kind 1:1 in the field service). */
  readonly kindLegend: readonly KindLegend[] = [
    { kind: 'service', icon: KIND_ICON.service, accent: 'var(--cyan)' },
    { kind: 'component', icon: KIND_ICON.component, accent: 'var(--indigo)' },
    { kind: 'token', icon: KIND_ICON.token, accent: 'var(--violet)' },
    { kind: 'directive', icon: KIND_ICON.directive, accent: 'var(--magenta)' },
    { kind: 'pipe', icon: KIND_ICON.pipe, accent: 'var(--emerald)' },
  ];

  /** Live per-kind node counts for the legend, seeded so every kind is present. */
  readonly kindCounts = computed<Record<NodeKind, number>>(() => {
    const counts: Record<NodeKind, number> = { service: 0, component: 0, token: 0, directive: 0, pipe: 0 };
    for (const node of this.field.graph().nodes) {
      counts[node.kind] += 1;
    }
    return counts;
  });

  constructor() {
    // Reseed the physics whenever the graph identity changes (e.g. regenerate).
    effect(() => {
      const nodes = this.field.graph().nodes;
      this.sim.set(
        nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, vx: n.vx, vy: n.vy })),
      );
    });

    if (this.isBrowser && !this.prefersReducedMotion()) {
      const timer = setInterval(() => this.integrate(), 66);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  /** Regenerate the whole field, clear any hover, and reseed physics. */
  regenerate(): void {
    this.hoveredId.set(null);
    this.field.regenerate();
  }

  hover(id: number): void {
    this.hoveredId.set(id);
  }

  clearHover(): void {
    this.hoveredId.set(null);
  }

  /** True when a node should recede because it is outside the hovered cluster. */
  isDimmed(id: number): boolean {
    const ids = this.connectedIds();
    return ids !== null && !ids.has(id);
  }

  /** True when a node is the hovered node or one of its neighbours. */
  isActive(id: number): boolean {
    const ids = this.connectedIds();
    return ids !== null && ids.has(id);
  }

  edgeActive(edge: GraphEdge): boolean {
    const id = this.hoveredId();
    return id !== null && (edge.source === id || edge.target === id);
  }

  edgeDimmed(edge: GraphEdge): boolean {
    const id = this.hoveredId();
    return id !== null && edge.source !== id && edge.target !== id;
  }

  private prefersReducedMotion(): boolean {
    return this.isBrowser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Advance the drift simulation one step, bouncing off the padded walls. */
  private integrate(): void {
    // Skip work entirely while the tab is backgrounded.
    if (document.hidden) return;
    const lo = MARGIN;
    const hi = 1 - MARGIN;
    this.sim.update((list) =>
      list.map((n) => {
        let { x, y, vx, vy } = n;
        vx += (Math.random() - 0.5) * 0.00018;
        vy += (Math.random() - 0.5) * 0.00018;
        vx = Math.max(-0.0016, Math.min(0.0016, vx));
        vy = Math.max(-0.0016, Math.min(0.0016, vy));
        x += vx;
        y += vy;
        if (x < lo) { x = lo; vx = Math.abs(vx); }
        if (x > hi) { x = hi; vx = -Math.abs(vx); }
        if (y < lo) { y = lo; vy = Math.abs(vy); }
        if (y > hi) { y = hi; vy = -Math.abs(vy); }
        return { id: n.id, x, y, vx, vy };
      }),
    );
  }

  private seed(): SimNode[] {
    return this.field
      .graph()
      .nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
  }
}
