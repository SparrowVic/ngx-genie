import {clamp01, lerp, smoothStep} from './render-math';
import {FrameContext, GroupRegion, RenderScene, ViewBounds} from './render-types';

/** Max group / subgroup halos kept and drawn per frame (also bounds what the engine builds). */
export const GROUP_REGION_MAX_DRAWN = 160;
export const SUBGROUP_REGION_MAX_DRAWN = 260;

/**
 * Draws the organic cluster halos behind grouped nodes: soft blobs (with a faint inner ellipse) per
 * group and subgroup, plus group labels when zoomed out. Only static (organic) layouts have regions;
 * visibility fades the halos in as the camera pulls back. Stateless — all input comes from the
 * {@link FrameContext} and the {@link RenderScene} it holds.
 */
export class ConstellationRegionRenderer {
  constructor(private readonly _scene: RenderScene) {}

  /** Draw every visible group and subgroup halo for this frame. */
  draw(frame: FrameContext): void {
    if (!frame.staticLayout) return;

    const groupVisibility = this._groupVisibility(frame.zoom);
    const subgroupVisibility = this._subgroupVisibility(frame.zoom);
    if (groupVisibility <= 0 && subgroupVisibility <= 0) return;

    const ctx = frame.ctx;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';

    if (groupVisibility > 0) {
      this._drawCollection(frame, this._scene.groupRegions, groupVisibility, GROUP_REGION_MAX_DRAWN);
    }
    if (subgroupVisibility > 0) {
      this._drawCollection(frame, this._scene.subgroupRegions, subgroupVisibility, SUBGROUP_REGION_MAX_DRAWN);
    }

    ctx.restore();
  }

  private _drawCollection(
    frame: FrameContext,
    regions: GroupRegion[],
    visibility: number,
    limit: number
  ): void {
    const {ctx, zoom, bounds} = frame;
    let drawn = 0;
    for (let index = regions.length - 1; index >= 0; index--) {
      const region = regions[index];
      if (!this._inBounds(region, bounds)) continue;
      if (drawn++ >= limit) break;

      const hue = this._hue(region.colorSeed);
      const isSubgroup = region.level === 'subgroup';
      const radius = region.radius * lerp(isSubgroup ? 0.90 : 0.82, isSubgroup ? 1.02 : 1.10, visibility);
      const fillAlpha = Math.min(
        isSubgroup ? 0.075 : 0.16,
        ((isSubgroup ? 0.016 : 0.035) + Math.log2(region.memberCount + 1) * (isSubgroup ? 0.006 : 0.012)) * visibility
      );
      const strokeAlpha = Math.min(
        isSubgroup ? 0.24 : 0.42,
        ((isSubgroup ? 0.06 : 0.12) + region.importance * (isSubgroup ? 0.08 : 0.14)) * visibility
      );

      this._drawBlob(ctx, region, radius, hue, fillAlpha, strokeAlpha, zoom);

      if (!isSubgroup && zoom < 0.36 && (region.importance >= 0.58 || region.memberCount >= 14)) {
        this._drawLabel(ctx, region, zoom, hue, visibility);
      }
    }
  }

  private _drawBlob(
    ctx: CanvasRenderingContext2D,
    region: GroupRegion,
    radius: number,
    hue: number,
    fillAlpha: number,
    strokeAlpha: number,
    zoom: number
  ): void {
    const points = region.level === 'subgroup' ? 18 : 28;
    const seedA = (region.colorSeed % 6283) / 1000;
    const seedB = ((region.colorSeed >>> 8) % 6283) / 1000;
    const xScale = (region.level === 'subgroup' ? 0.96 : 1.04) + ((region.colorSeed % 17) - 8) * 0.008;
    const yScale = (region.level === 'subgroup' ? 0.86 : 0.78) + (((region.colorSeed >>> 5) % 21) - 10) * 0.009;
    const center = this._scene.applyZoomOutSpread(region.x, region.y);
    const spreadRadius = this._scene.scaleZoomOutDistance(radius);

    ctx.beginPath();
    for (let index = 0; index <= points; index++) {
      const angle = index * (Math.PI * 2 / points);
      const organic = 1
        + Math.sin(angle * 3 + seedA) * 0.075
        + Math.cos(angle * 5 + seedB) * 0.045;
      const x = center.x + Math.cos(angle) * spreadRadius * xScale * organic;
      const y = center.y + Math.sin(angle) * spreadRadius * yScale * organic;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 86%, 45%, ${fillAlpha})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 95%, 62%, ${strokeAlpha})`;
    ctx.lineWidth = Math.max(1, 1.35 / Math.max(zoom, 0.0005));
    ctx.stroke();

    ctx.globalAlpha = Math.min(0.20, strokeAlpha * 0.52);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, spreadRadius * xScale * 0.58, spreadRadius * yScale * 0.45, seedA * 0.12, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 95%, 68%, 1)`;
    ctx.lineWidth = Math.max(0.8, 0.9 / Math.max(zoom, 0.0005));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private _drawLabel(
    ctx: CanvasRenderingContext2D,
    region: GroupRegion,
    zoom: number,
    hue: number,
    visibility: number
  ): void {
    const previousAlpha = ctx.globalAlpha;
    const safeZoom = Math.max(zoom, 0.0005);
    const label = region.label.length > 26 ? `${region.label.slice(0, 24)}...` : region.label;
    const fontSize = Math.max(10, Math.min(16, 10 + region.importance * 5)) / safeZoom;
    const center = this._scene.applyZoomOutSpread(region.x, region.y);

    ctx.globalAlpha = Math.min(0.82, visibility * 0.62);
    ctx.font = `800 ${fontSize}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `hsla(${hue}, 95%, 74%, 1)`;
    ctx.fillText(label.toUpperCase(), center.x, center.y);
    ctx.font = `700 ${Math.max(8, fontSize * safeZoom * 0.72) / safeZoom}px JetBrains Mono, monospace`;
    ctx.fillStyle = `hsla(${hue}, 95%, 78%, 0.68)`;
    ctx.fillText(`${region.memberCount} nodes`, center.x, center.y + fontSize * 1.05);
    ctx.globalAlpha = previousAlpha;
  }

  private _groupVisibility(zoom: number): number {
    if (zoom >= 0.92) return 0;
    if (zoom <= 0.16) return 1;
    return smoothStep(clamp01((0.92 - zoom) / 0.76));
  }

  private _subgroupVisibility(zoom: number): number {
    if (zoom >= 0.72) return 0;
    if (zoom <= 0.20) return 0.72;
    return 0.72 * smoothStep(clamp01((0.72 - zoom) / 0.52));
  }

  private _inBounds(region: GroupRegion, bounds: ViewBounds): boolean {
    const center = this._scene.applyZoomOutSpread(region.x, region.y);
    const radius = this._scene.scaleZoomOutDistance(region.radius * 1.22);
    return center.x + radius >= bounds.left
      && center.x - radius <= bounds.right
      && center.y + radius >= bounds.top
      && center.y - radius <= bounds.bottom;
  }

  private _hue(seed: number): number {
    const palette = [188, 164, 204, 138, 48, 220, 174, 198];
    return palette[seed % palette.length];
  }
}
