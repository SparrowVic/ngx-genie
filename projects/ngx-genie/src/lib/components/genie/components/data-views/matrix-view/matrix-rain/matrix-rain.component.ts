import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  NgZone,
  OnDestroy,
  viewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';

const MATRIX_RAIN_CHARS = '0123456789'.repeat(5)
  + 'qwertyuiopasdfghjklzxcvbnm010101'
  + 'カグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヲン';

@Component({
  selector: 'lib-matrix-rain',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matrix-rain.component.html',
  styleUrl: './matrix-rain.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatrixRainComponent implements AfterViewInit, OnDestroy {
  readonly active = input<boolean>(true);
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private ctx!: CanvasRenderingContext2D;
  private animationId = 0;
  private drops: number[] = [];
  private lastDrawTime = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly ngZone = inject(NgZone);
  private readonly el = inject(ElementRef);

  constructor() {
    effect(() => {
      const isActive = this.active();
      if (this.ctx) {
        if (isActive) {
          this.ngZone.runOutsideAngular(() => this.animate(0));
        } else {
          this.stopAnimation();
          this.clearCanvas();
        }
      }
    });
  }

  ngAfterViewInit() {
    this.initCanvas();
  }

  ngOnDestroy() {
    this.stopAnimation();
    this.resizeObserver?.disconnect();
  }

  private initCanvas() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d', {alpha: true});
    if (!ctx) return;
    this.ctx = ctx;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.el.nativeElement);
    this.handleResize();

    if (this.active()) {
      this.ngZone.runOutsideAngular(() => this.animate(0));
    }
  }

  private handleResize() {
    const canvas = this.canvasRef().nativeElement;
    const rect = this.el.nativeElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    const fontSize = 16;
    const columns = Math.ceil(rect.width / fontSize);

    if (this.drops.length !== columns) {
      this.drops = Array(columns).fill(1).map(() => Math.random() * -100);
    }
  }

  private animate = (time: number) => {
    if (!this.active()) return;
    this.animationId = requestAnimationFrame(this.animate);

    const fps = 24;
    const interval = 1000 / fps;
    const delta = time - this.lastDrawTime;

    if (delta < interval) return;
    this.lastDrawTime = time - (delta % interval);

    const canvas = this.canvasRef().nativeElement;
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    this.ctx.fillStyle = 'rgba(5, 10, 7, 0.1)';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.font = '14px monospace';
    this.ctx.textAlign = 'center';

    for (let i = 0; i < this.drops.length; i++) {
      const char = MATRIX_RAIN_CHARS.charAt(Math.floor(Math.random() * MATRIX_RAIN_CHARS.length));
      const x = i * 16 + 8;
      const y = this.drops[i] * 16;

      const isHead = Math.random() > 0.98;
      if (isHead) {
        this.ctx.fillStyle = '#fff';
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#fff';
      } else {
        this.ctx.fillStyle = '#00ff41';
        this.ctx.shadowBlur = 0;
      }

      this.ctx.fillText(char, x, y);

      if (y > height && Math.random() > 0.98) {
        this.drops[i] = 0;
      }
      this.drops[i]++;
    }
  }

  private stopAnimation() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  private clearCanvas() {
    if (this.ctx && this.canvasRef()) {
      const canvas = this.canvasRef().nativeElement;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
