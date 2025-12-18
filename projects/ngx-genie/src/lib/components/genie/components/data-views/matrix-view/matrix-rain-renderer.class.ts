import {GENIE_ICONS} from '../../../../../resources/icons/icons';
import {MATRIX_RAIN_CHARS, THEME} from './matrix.configs';

export class MatrixRainRenderer {
  private rainCanvas: HTMLCanvasElement | null = null;
  private rainCtx: CanvasRenderingContext2D | null = null;

  private cornerRainCanvas: HTMLCanvasElement | null = null;
  private cornerRainCtx: CanvasRenderingContext2D | null = null;
  private cornerCompositeCanvas: HTMLCanvasElement | null = null;
  private cornerCompositeCtx: CanvasRenderingContext2D | null = null;

  private drops: number[] = [];
  private cornerDrops: number[] = [];
  private lastRainTime = 0;
  private lastCornerRainTime = 0;

  private genieImg: HTMLImageElement | null = null;

  constructor() {
    this.preloadGenieImage();
  }

  init() {
    this.rainCanvas = document.createElement('canvas');
    this.rainCtx = this.rainCanvas.getContext('2d', {alpha: false});

    this.cornerRainCanvas = document.createElement('canvas');
    this.cornerRainCtx = this.cornerRainCanvas.getContext('2d', {alpha: true});

    this.cornerCompositeCanvas = document.createElement('canvas');
    this.cornerCompositeCtx = this.cornerCompositeCanvas.getContext('2d', {alpha: true});
  }

  resize(viewWidth: number, viewHeight: number, dpr: number, cornerW: number, cornerH: number) {
    if (this.rainCanvas && this.rainCtx) {
      this.rainCanvas.width = viewWidth * dpr;
      this.rainCanvas.height = viewHeight * dpr;
      this.rainCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.rainCtx.scale(dpr, dpr);
      this.rainCtx.fillStyle = THEME.bgDeep;
      this.rainCtx.fillRect(0, 0, viewWidth, viewHeight);
    }

    if (this.cornerRainCanvas && this.cornerRainCtx && this.cornerCompositeCanvas && this.cornerCompositeCtx) {
      this.cornerRainCtx.clearRect(0, 0, this.cornerRainCanvas.width, this.cornerRainCanvas.height);
      this.cornerCompositeCtx.clearRect(0, 0, this.cornerCompositeCanvas.width, this.cornerCompositeCanvas.height);

      this.cornerRainCanvas.width = cornerW * dpr;
      this.cornerRainCanvas.height = cornerH * dpr;
      this.cornerRainCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.cornerRainCtx.scale(dpr, dpr);

      this.cornerRainCtx.fillStyle = 'rgba(5, 15, 7, 0.0)';
      this.cornerRainCtx.fillRect(0, 0, cornerW, cornerH);

      this.cornerCompositeCanvas.width = cornerW * dpr;
      this.cornerCompositeCanvas.height = cornerH * dpr;
      this.cornerCompositeCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.cornerCompositeCtx.scale(dpr, dpr);
    }

    this.initDrops(viewWidth, cornerW);
  }

  private initDrops(viewWidth: number, cornerW: number) {
    if (viewWidth === 0) return;
    const fontSize = 16;
    const cols = Math.ceil(viewWidth / fontSize);
    if (this.drops.length !== cols) {
      this.drops = Array(cols).fill(1).map(() => Math.random() * -100);
    }
    const cornerCols = Math.ceil(cornerW / 8);
    this.cornerDrops = Array(cornerCols).fill(1).map(() => Math.random() * -50);
  }

  getRainCanvas(): HTMLCanvasElement | null {
    return this.rainCanvas;
  }

  updateRain(time: number, w: number, h: number) {
    if (!this.rainCtx) return;

    const fps = 24;
    const interval = 1000 / fps;
    const elapsed = time - this.lastRainTime;

    if (elapsed < interval) return;
    this.lastRainTime = time - (elapsed % interval);

    this.rainCtx.fillStyle = 'rgba(5, 10, 7, 0.1)';
    this.rainCtx.fillRect(0, 0, w, h);

    this.rainCtx.font = '14px monospace';
    this.rainCtx.textAlign = 'center';

    for (let i = 0; i < this.drops.length; i++) {
      const char = MATRIX_RAIN_CHARS.charAt(Math.floor(Math.random() * MATRIX_RAIN_CHARS.length));
      const x = i * 16 + 8;
      const y = this.drops[i] * 16;

      const isHead = Math.random() > 0.98;

      if (isHead) {
        this.rainCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      } else {
        this.rainCtx.fillStyle = 'rgba(0, 255, 65, 0.5)';
      }

      this.rainCtx.fillText(char, x, y);

      if (y > h && Math.random() > 0.98) {
        this.drops[i] = 0;
      }
      this.drops[i]++;
    }
  }

  drawCornerContent(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, showRain: boolean) {
    if (showRain) {
      const fps = 15;
      const interval = 1000 / fps;

      if (time - this.lastCornerRainTime > interval) {
        this.updateCornerRain(h);
        this.lastCornerRainTime = time;
      }

      if (this.genieImg && this.genieImg.complete && this.cornerCompositeCtx && this.cornerCompositeCanvas && this.cornerRainCanvas) {
        const cCtx = this.cornerCompositeCtx;

        cCtx.clearRect(0, 0, this.cornerCompositeCanvas.width, this.cornerCompositeCanvas.height);

        const imgAspect = this.genieImg.width / this.genieImg.height;
        const targetW = w * 0.9;
        const targetH = targetW / imgAspect;
        const dx = (w - targetW) / 2;
        const dy = (h - targetH) / 2;

        cCtx.globalCompositeOperation = 'source-over';
        cCtx.drawImage(this.genieImg, dx, dy, targetW, targetH);

        cCtx.globalCompositeOperation = 'source-in';
        cCtx.drawImage(this.cornerRainCanvas, 0, 0);

        cCtx.globalCompositeOperation = 'source-over';

        ctx.drawImage(this.cornerCompositeCanvas, 0, 0, w, h, 0, 0, w, h);

        ctx.globalAlpha = 0.3;
        ctx.drawImage(this.genieImg, dx, dy, targetW, targetH);
        ctx.globalAlpha = 1.0;
      }
    } else if (this.genieImg && this.genieImg.complete) {
      const imgAspect = this.genieImg.width / this.genieImg.height;
      const targetW = w * 0.9;
      const targetH = targetW / imgAspect;
      const dx = (w - targetW) / 2;
      const dy = (h - targetH) / 2;
      ctx.drawImage(this.genieImg, dx, dy, targetW, targetH);
    }
  }

  private updateCornerRain(h: number) {
    if (!this.cornerRainCtx || !this.cornerRainCanvas) return;

    this.cornerRainCtx.fillStyle = 'rgba(5, 15, 7, 0.2)';
    this.cornerRainCtx.fillRect(0, 0, this.cornerRainCanvas.width, this.cornerRainCanvas.height);

    this.cornerRainCtx.font = '8px monospace';
    this.cornerRainCtx.textAlign = 'center';

    for (let i = 0; i < this.cornerDrops.length; i++) {
      const char = MATRIX_RAIN_CHARS.charAt(Math.floor(Math.random() * MATRIX_RAIN_CHARS.length));
      const x = i * 8 + 4;
      const y = this.cornerDrops[i] * 8;

      const isHead = Math.random() > 0.95;
      this.cornerRainCtx.fillStyle = isHead ? '#fff' : '#00ff41';

      this.cornerRainCtx.fillText(char, x, y);

      if (y > h && Math.random() > 0.95) {
        this.cornerDrops[i] = 0;
      }
      this.cornerDrops[i]++;
    }
  }

  private preloadGenieImage() {
    const encodedSvg = encodeURIComponent(GENIE_ICONS.GENIE_LAMP);
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
    this.genieImg = new Image();
    this.genieImg.src = dataUri;
  }
}
