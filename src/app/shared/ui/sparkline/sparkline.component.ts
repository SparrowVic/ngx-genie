import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Point {
  x: number;
  y: number;
}

interface SparkGeometry {
  /** Polyline points for the trend line. */
  points: string;
  /** Closed polygon points for the gradient area fill. */
  area: string;
  /** Final data point — where the glowing dot sits. */
  end: Point;
}

/** Ensures each instance references its own <linearGradient> id even in Emulated encapsulation. */
let sparkSeq = 0;

/**
 * ui-sparkline — a compact inline SVG trend line. Values are normalised to the data's
 * own min/max and rendered as a polyline over a soft gradient area, capped by a glowing
 * end dot. All geometry is derived reactively via computed() from the `data` input.
 */
@Component({
  selector: 'ui-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sparkline.component.html',
  styleUrl: './sparkline.component.scss',
})
export class SparklineComponent {
  readonly data = input.required<number[]>();
  readonly accent = input('var(--cyan)');
  readonly width = input(120);
  readonly height = input(36);

  /** Stable, instance-unique gradient id. */
  readonly gradId = `gx-spark-${sparkSeq++}`;
  readonly areaFill = computed(() => `url(#${this.gradId})`);

  readonly geo = computed<SparkGeometry>(() => {
    const values = this.data();
    const w = this.width();
    const h = this.height();
    const padX = 3;
    const padY = 4;
    const n = values.length;

    if (n === 0) {
      return { points: '', area: '', end: { x: padX, y: h / 2 } };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerW = Math.max(0, w - padX * 2);
    const innerH = Math.max(0, h - padY * 2);

    const coords: Point[] = values.map((v, i) => ({
      x: n === 1 ? w / 2 : padX + (i / (n - 1)) * innerW,
      y: padY + (1 - (v - min) / range) * innerH,
    }));

    const points = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
    const first = coords[0];
    const last = coords[coords.length - 1];
    const baseline = h.toFixed(2);
    const area = `${first.x.toFixed(2)},${baseline} ${points} ${last.x.toFixed(2)},${baseline}`;

    return { points, area, end: last };
  });

  readonly ariaLabel = computed(() => {
    const values = this.data();
    if (values.length < 2) {
      return `Sparkline trend, ${values.length} data point`;
    }
    const trend = values[values.length - 1] >= values[0] ? 'trending up' : 'trending down';
    return `Sparkline trend, ${values.length} data points, ${trend}`;
  });
}
