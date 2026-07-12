import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LogoComponent } from '../../../../shared/ui/logo/logo.component';
import { ConstellationFieldService } from '../../../../core/services/constellation-field.service';

interface OrbitNode {
  readonly id: number;
  readonly label: string;
  readonly kind: string;
  readonly accent: string;
  /** Angular position on the ring, in degrees. */
  readonly angle: number;
}

interface OrbitRing {
  readonly id: number;
  /** Ring radius as a share of the container's smaller edge (cqmin units). */
  readonly radius: number;
  readonly duration: number;
  readonly reverse: boolean;
  readonly nodes: readonly OrbitNode[];
}

/** Ring layout: radius (cqmin), spin duration (s), direction, and which graph slice to use. */
const RING_SPECS = [
  { radius: 24, duration: 34, reverse: false, start: 0, count: 5 },
  { radius: 35, duration: 52, reverse: true, start: 5, count: 7 },
  { radius: 46, duration: 42, reverse: false, start: 12, count: 9 },
] as const;

/**
 * app-hero-orbit — the decorative centrepiece: the animated GenieOS lamp at the
 * core, encircled by three counter-rotating rings of provider nodes sliced from
 * the live dependency graph. Hovering a node lifts its label into the caption.
 */
@Component({
  standalone: true,
  selector: 'app-hero-orbit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-orbit.component.html',
  styleUrl: './hero-orbit.component.scss',
  imports: [LogoComponent],
})
export class HeroOrbitComponent {
  private readonly field = inject(ConstellationFieldService);

  readonly nodeCount = this.field.nodeCount;
  private readonly activeLabel = signal<string | null>(null);

  /** Three evenly-spaced rings derived reactively from the graph nodes. */
  readonly rings = computed<OrbitRing[]>(() => {
    const nodes = this.field.graph().nodes;
    return RING_SPECS.map((spec, ri) => {
      const slice = nodes.slice(spec.start, spec.start + spec.count);
      const count = slice.length || 1;
      return {
        id: ri,
        radius: spec.radius,
        duration: spec.duration,
        reverse: spec.reverse,
        nodes: slice.map((node, i) => ({
          id: node.id,
          label: node.label,
          kind: node.kind,
          accent: node.accent,
          angle: (360 / count) * i + ri * 17,
        })),
      };
    });
  });

  /** Caption follows the hovered node, falling back to a live provider count. */
  readonly caption = computed(
    () => this.activeLabel() ?? `${this.nodeCount()} providers mapped`,
  );

  focus(label: string): void {
    this.activeLabel.set(label);
  }

  clear(): void {
    this.activeLabel.set(null);
  }
}
