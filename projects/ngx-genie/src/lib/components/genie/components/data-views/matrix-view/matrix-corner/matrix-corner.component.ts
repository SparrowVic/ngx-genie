import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  viewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {GENIE_ICONS} from '../../../../../../resources/icons/icons';

const GENIE_LAMP = GENIE_ICONS.GENIE_LAMP;

@Component({
  selector: 'lib-matrix-corner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'matrix-corner.component.html',
  styleUrl: 'matrix-corner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatrixCornerComponent implements AfterViewInit, OnDestroy {
  readonly active = input<boolean>(true);
  readonly genieCanvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('genieCanvas');

  private ctx!: CanvasRenderingContext2D;
  private animationId = 0;
  private drops: number[] = [];
  private img: HTMLImageElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastDrawTime = 0;
  private readonly chars = '0123456789'.repeat(5) + 'qwertyuiopasdfghjklzxcvbnm010101カグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヲン';
  private readonly ngZone = inject(NgZone);


  ngAfterViewInit() {
    this.loadImage();
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
  }

  handleResize() {
    const canvas = this.genieCanvasRef().nativeElement;
    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    const cols = Math.ceil(rect.width / 6);
    if (this.drops.length !== cols) {
      this.drops = Array(cols).fill(0).map(() => Math.random() * -100);
    }
  }

  private loadImage() {
    const encodedSvg = encodeURIComponent(GENIE_LAMP);
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

    this.img = new Image();
    this.img.src = dataUri;
    this.img.onload = () => {
      this.initCanvas();
    };
  }

  private initCanvas() {
    const canvas = this.genieCanvasRef().nativeElement;
    this.ctx = canvas.getContext('2d', {alpha: true})!;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
    }
    this.handleResize();

    this.ngZone.runOutsideAngular(() => this.animate(0));
  }

  private animate = (time: number) => {
    this.animationId = requestAnimationFrame(this.animate);
    if (!this.img || !this.genieCanvasRef() || !this.ctx) return;

    const canvas = this.genieCanvasRef().nativeElement;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const ctx = this.ctx;

    const drawImageCentered = (op: GlobalCompositeOperation) => {
      const imgAspect = 820 / 512;
      const cvsAspect = w / h;
      let dw, dh, dx, dy;

      if (cvsAspect > imgAspect) {
        dh = h;
        dw = h * imgAspect;
        dx = (w - dw) / 2;
        dy = 0;
      } else {
        dw = w;
        dh = w / imgAspect;
        dx = 0;
        dy = (h - dh) / 2;
      }

      ctx.globalCompositeOperation = op;
      ctx.drawImage(this.img!, dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    };

    if (!this.active()) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.5 + Math.sin(time / 500) * 0.1;
      drawImageCentered('source-over');
      ctx.globalAlpha = 1.0;
      return;
    }

    const elapsed = time - this.lastDrawTime;
    if (elapsed < 80) return;
    this.lastDrawTime = time - (elapsed % 80);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 5, 0, 0.15)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = 'bold 6px monospace';

    for (let i = 0; i < this.drops.length; i++) {
      const text = this.chars.charAt(Math.floor(Math.random() * this.chars.length));
      ctx.fillStyle = Math.random() > 0.95 ? '#FFF' : '#00FF41';
      ctx.fillText(text, i * 6 + 3, this.drops[i] * 6);

      if (this.drops[i] * 6 > h && Math.random() > 0.95) {
        this.drops[i] = 0;
      }
      this.drops[i]++;
    }
    drawImageCentered('destination-in');
  }
}
