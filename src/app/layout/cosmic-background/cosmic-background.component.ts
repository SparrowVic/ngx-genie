import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ConstellationFieldService } from '../../core/services/constellation-field.service';
import { FEATURE_FLAGS } from '../../core/tokens/feature-flags.token';

/** A single background star with a slow drift and twinkle phase. */
interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
}

/** A drifting constellation particle (a copy of a graph node, so we never mutate shared state). */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
}

/** A resolved graph edge between two particle indices. */
interface Link {
  source: number;
  target: number;
  strength: number;
}

/**
 * app-cosmic-background — a fixed, full-viewport canvas painted behind the whole
 * app. It renders a subtle twinkling starfield and a slowly drifting projection
 * of the GenieOS dependency graph (nodes as glowing dots, edges as faint lines).
 *
 * Everything is browser-only and gated on the `cosmicBackground` feature flag;
 * it respects prefers-reduced-motion by painting a single static frame.
 */
@Component({
  selector: 'app-cosmic-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cosmic-background.component.html',
  styleUrl: './cosmic-background.component.scss',
})
export class CosmicBackgroundComponent implements OnDestroy {
  private readonly field = inject(ConstellationFieldService);
  private readonly flags = inject(FEATURE_FLAGS);
  private readonly platformId = inject(PLATFORM_ID);

  /** Public so the template can skip rendering the canvas entirely when disabled. */
  readonly enabled = this.flags.cosmicBackground;

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private ctx: CanvasRenderingContext2D | null = null;
  private rafId = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private reduced = false;
  private running = false;

  private stars: Star[] = [];
  private particles: Particle[] = [];
  private links: Link[] = [];
  private readonly colorCache = new Map<string, string>();

  private readonly onResize = (): void => this.resize();

  constructor() {
    // afterNextRender only runs in the browser, giving us a safe DOM + a ready canvas.
    afterNextRender(() => {
      if (!this.enabled) return;
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas) return;
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) return;

      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.resize();
      this.seedStars();
      this.seedConstellation();
      window.addEventListener('resize', this.onResize, { passive: true });

      if (this.reduced) {
        this.render(0);
      } else {
        this.running = true;
        this.rafId = requestAnimationFrame(this.loop);
      }
    });
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
  }

  private readonly loop = (t: number): void => {
    if (!this.running) return;
    this.render(t);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private resize(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.reduced) this.render(0);
  }

  /** Star count scales with viewport area, capped for performance. */
  private seedStars(): void {
    const target = Math.round(Math.min(220, Math.max(70, (this.width * this.height) / 9000)));
    this.stars = Array.from({ length: target }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00004,
      vy: (Math.random() - 0.5) * 0.00004,
      r: Math.random() * 1.1 + 0.35,
      base: Math.random() * 0.4 + 0.25,
      speed: Math.random() * 0.0016 + 0.0006,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  /** Snapshot the DI graph into local particles so we never mutate the shared service state. */
  private seedConstellation(): void {
    const graph = this.field.graph();
    this.particles = graph.nodes.map((n) => ({
      x: n.x,
      y: n.y,
      vx: n.vx,
      vy: n.vy,
      r: n.r,
      color: this.resolveColor(n.accent),
    }));
    this.links = graph.edges.map((e) => ({ source: e.source, target: e.target, strength: e.strength }));
  }

  private render(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    this.drawStars(ctx, t, w, h);
    if (!this.reduced) this.advanceParticles();
    this.drawLinks(ctx, w, h);
    this.drawNodes(ctx, w, h);
  }

  private drawStars(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
    for (const s of this.stars) {
      if (!this.reduced) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x += 1;
        else if (s.x > 1) s.x -= 1;
        if (s.y < 0) s.y += 1;
        else if (s.y > 1) s.y -= 1;
      }
      const twinkle = this.reduced ? s.base : s.base * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
      const alpha = Math.max(0, Math.min(1, twinkle));
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(214, 224, 255, ${alpha})`;
      ctx.fill();
    }
  }

  private advanceParticles(): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x <= 0.02 || p.x >= 0.98) p.vx *= -1;
      if (p.y <= 0.02 || p.y >= 0.98) p.vy *= -1;
      p.x = Math.max(0.02, Math.min(0.98, p.x));
      p.y = Math.max(0.02, Math.min(0.98, p.y));
    }
  }

  private drawLinks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const maxDist = Math.min(w, h) * 0.34;
    ctx.lineWidth = 1;
    for (const link of this.links) {
      const a = this.particles[link.source];
      const b = this.particles[link.target];
      if (!a || !b) continue;
      const ax = a.x * w;
      const ay = a.y * h;
      const bx = b.x * w;
      const by = b.y * h;
      const dist = Math.hypot(bx - ax, by - ay);
      if (dist > maxDist) continue;
      const fade = (1 - dist / maxDist) * link.strength * 0.5;
      if (fade <= 0.01) continue;
      const grad = ctx.createLinearGradient(ax, ay, bx, by);
      grad.addColorStop(0, this.withAlpha(a.color, fade));
      grad.addColorStop(1, this.withAlpha(b.color, fade));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  private drawNodes(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    for (const p of this.particles) {
      const cx = p.x * w;
      const cy = p.y * h;
      const glow = p.r * 4.5;
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, glow);
      halo.addColorStop(0, this.withAlpha(p.color, 0.45));
      halo.addColorStop(1, this.withAlpha(p.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, glow, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.withAlpha(p.color, 0.95);
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Resolve a `var(--token)` accent to a concrete hex value from the document root. */
  private resolveColor(token: string): string {
    const cached = this.colorCache.get(token);
    if (cached) return cached;
    let color = token;
    const match = /var\((--[a-z0-9-]+)\)/i.exec(token);
    if (match) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
      if (value) color = value;
    }
    this.colorCache.set(token, color);
    return color;
  }

  /** Apply an alpha to a `#rrggbb` colour, returning an rgba() string. */
  private withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }
}
