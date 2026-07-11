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

/** Horizontal inset so the line never kisses the frame. */
const PAD_X = 3;
/** Vertical inset for stroke caps and the end dot. */
const PAD_Y = 4;

/** Ensures each instance references its own <linearGradient> ids even in Emulated encapsulation. */
let sparkSeq = 0;

/**
 * ui-sparkline — a compact inline SVG trend line. Values are normalised to the data's
 * own min/max and rendered as a gradient polyline over a soft area fill, above a
 * hairline grid, capped by a glowing end dot. All geometry is derived reactively
 * via computed() from the `data` input.
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

  /** Stable, instance-unique gradient ids. */
  private readonly uid = sparkSeq++;
  readonly gradId = `gx-spark-${this.uid}`;
  readonly strokeGradId = `gx-spark-stroke-${this.uid}`;
  readonly areaFill = computed(() => `url(#${this.gradId})`);
  readonly strokePaint = computed(() => `url(#${this.strokeGradId})`);

  readonly padX = PAD_X;

  /** Hairline grid rows at quarter heights. */
  readonly gridYs = computed(() => {
    const h = this.height();
    return [0.25, 0.5, 0.75].map((f) => Number((f * h).toFixed(2)));
  });

  readonly geo = computed<SparkGeometry>(() => {
    const values = this.data();
    const w = this.width();
    const h = this.height();
    const n = values.length;

    if (n === 0) {
      return { points: '', area: '', end: { x: PAD_X, y: h / 2 } };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerW = Math.max(0, w - PAD_X * 2);
    const innerH = Math.max(0, h - PAD_Y * 2);

    const coords: Point[] = values.map((v, i) => ({
      x: n === 1 ? w / 2 : PAD_X + (i / (n - 1)) * innerW,
      y: PAD_Y + (1 - (v - min) / range) * innerH,
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
