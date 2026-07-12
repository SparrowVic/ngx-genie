import {RenderNode} from '../../models/constellation.models';
import {NodeVisuals} from './node-visuals';
import {lerp} from './render-math';
import {FrameContext, RenderScene} from './render-types';

/** Node opacity for non-focused, non-neighbour nodes while focus mode is active. */
const FOCUS_DIM_NODE_OPACITY = 0.34;

/**
 * Draws a single node: injectors as rotating hexagons, everything else as pulsing diamonds, plus the
 * zoomed-out prominence beacon and the node label. Reads its size/importance/label decisions from
 * {@link NodeVisuals} and positions from the {@link RenderScene}; per-frame state (zoom, focus, hover,
 * animation) comes from the {@link FrameContext}. Stateless.
 */
export class ConstellationNodeRenderer {
  constructor(
    private readonly _scene: RenderScene,
    private readonly _visuals: NodeVisuals
  ) {}

  /** Draw one node at its display position, honouring focus dimming and hover/pin highlight. */
  draw(frame: FrameContext, node: RenderNode): void {
    const {ctx, zoom, isFocusActive, time} = frame;
    let nodeOpacity = 1.0;
    const isHighlight = frame.hoveredNode === node || frame.pinnedNode === node;
    const visualRadius = this._visuals.visualRadius(node, zoom);
    const displayPosition = this._scene.getDisplayPosition(node);
    const originalX = node.x;
    const originalY = node.y;
    node.x = displayPosition.x;
    node.y = displayPosition.y;

    if (isFocusActive) {
      const isNeighbor = frame.focusedNodeIds.has(node.id);
      if (!isHighlight && !isNeighbor) {
        nodeOpacity = lerp(1.0, FOCUS_DIM_NODE_OPACITY, frame.focusLevel);
      }
    }

    if (node.meta?.isUnused && !this._scene.unusedPattern) nodeOpacity *= 0.4;

    ctx.globalAlpha = nodeOpacity;
    this._drawBeacon(ctx, node, zoom, visualRadius, isHighlight);

    if (node.type === 'injector') {
      this._drawHexagon(frame, node, zoom, isHighlight, time, visualRadius);
    } else {
      const isFramework = !!node.meta?.isFramework;
      const isUnused = !!node.meta?.isUnused;
      this._drawDiamond(frame, node, zoom, isHighlight, time, isFramework, isUnused, visualRadius);
    }

    node.x = originalX;
    node.y = originalY;
    ctx.globalAlpha = 1.0;
  }

  private _drawBeacon(
    ctx: CanvasRenderingContext2D,
    node: RenderNode,
    zoom: number,
    radius: number,
    isHighlight: boolean
  ): void {
    const overview = this._visuals.overviewFactor(zoom);
    if (overview <= 0) return;

    const importance = this._visuals.importance(node);
    const isRoot = !!node.meta?.isRoot;
    const isProminent = isRoot
      || isHighlight
      || (node.type === 'injector' && importance >= 0.52)
      || (node.type === 'service' && importance >= 0.82);
    if (!isProminent) return;

    const previousAlpha = ctx.globalAlpha;
    const alpha = previousAlpha * overview * (isRoot ? 0.24 : node.type === 'injector' ? 0.15 : 0.10);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * (isRoot ? 2.4 : 1.95), 0, Math.PI * 2);
    ctx.strokeStyle = node.glowColor;
    ctx.lineWidth = Math.max(0.8, 1.15 / Math.max(zoom, 0.0005));
    ctx.stroke();

    if (isRoot || importance >= 0.82 || isHighlight) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * (isRoot ? 3.6 : 2.75), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = previousAlpha;
  }

  private _drawHexagon(
    frame: FrameContext,
    node: RenderNode,
    zoom: number,
    isHighlight: boolean,
    time: number,
    radius: number
  ): void {
    const ctx = frame.ctx;
    const {x, y, baseColor, glowColor} = node;
    let currentAngle = node.angle || 0;
    if (frame.animateVisuals) {
      currentAngle += time * (isHighlight ? 0.002 : 0.0005);
    }

    if (isHighlight || node.meta?.isRoot) {
      ctx.shadowBlur = isHighlight ? 30 : 15;
      ctx.shadowColor = glowColor;
    }

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const theta = currentAngle + (i * Math.PI * 2) / 6;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](x + radius * Math.cos(theta), y + radius * Math.sin(theta));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = (isHighlight ? 2 : 1.5) / zoom;
    ctx.stroke();

    ctx.beginPath();
    if (node.meta?.isRoot) {
      ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();
    } else {
      for (let i = 0; i < 6; i++) {
        const theta = -currentAngle * 2 + (i * Math.PI * 2) / 6;
        const r = radius * 0.5;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](x + r * Math.cos(theta), y + r * Math.sin(theta));
      }
      ctx.closePath();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 0.5 / zoom;
      ctx.stroke();
    }

    if (isHighlight || this._visuals.shouldRenderLabels(zoom, 0.6) || this._visuals.shouldRenderOverviewLabel(node, zoom)) {
      this._drawLabel(ctx, node, y + radius + 12 / zoom, zoom, isHighlight || this._visuals.shouldRenderOverviewLabel(node, zoom));
    }
  }

  private _drawDiamond(
    frame: FrameContext,
    node: RenderNode,
    zoom: number,
    isHighlight: boolean,
    time: number,
    isFramework: boolean,
    isUnused: boolean,
    radius: number
  ): void {
    const ctx = frame.ctx;
    const {x, y, baseColor, glowColor} = node;
    let sizeAnim = radius;

    if (frame.animateVisuals) {
      const pulse = Math.sin((time + (node.pulseOffset || 0)) / (isFramework ? 600 : 400));
      sizeAnim = radius * (1 + pulse * 0.1);
    }

    if (isHighlight || node.meta?.isRoot) {
      ctx.shadowBlur = isHighlight ? 20 : 10;
      ctx.shadowColor = glowColor;
    } else if (isFramework) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = baseColor;
    }

    ctx.beginPath();
    ctx.moveTo(x, y - sizeAnim);
    ctx.lineTo(x + sizeAnim, y);
    ctx.lineTo(x, y + sizeAnim);
    ctx.lineTo(x - sizeAnim, y);
    ctx.closePath();

    if (isUnused && this._scene.unusedPattern) {
      ctx.fillStyle = this._scene.unusedPattern;
      ctx.fill();
    } else if (isFramework) {
      const grad = ctx.createLinearGradient(x - sizeAnim, y - sizeAnim, x + sizeAnim, y + sizeAnim);
      grad.addColorStop(0, 'rgba(0,0,0,0.8)');
      grad.addColorStop(0.5, baseColor + '11');
      grad.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      ctx.fillStyle = isHighlight ? glowColor : baseColor;
      ctx.fill();
    }

    ctx.strokeStyle = isHighlight ? glowColor : baseColor;
    ctx.lineWidth = (isHighlight ? 2.5 : 1.5) / zoom;
    if (isUnused) {
      ctx.strokeStyle = '#64748b';
    }
    ctx.stroke();

    ctx.shadowBlur = 0;

    if (isHighlight || this._visuals.shouldRenderLabels(zoom, 0.8) || this._visuals.shouldRenderOverviewLabel(node, zoom)) {
      this._drawLabel(ctx, node, y + radius + 10 / zoom, zoom, isHighlight || this._visuals.shouldRenderOverviewLabel(node, zoom));
    }
  }

  private _drawLabel(
    ctx: CanvasRenderingContext2D,
    node: RenderNode,
    yPos: number,
    zoom: number,
    isHighlight: boolean
  ): void {
    ctx.fillStyle = isHighlight ? '#fff' : 'rgba(226, 232, 240, 0.8)';
    if (node.meta?.isUnused) ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';

    const fontSize = this._visuals.labelScreenFontSize(zoom, isHighlight) / Math.max(zoom, 0.0005);
    ctx.font = `${isHighlight ? 'bold' : ''} ${fontSize}px "JetBrains Mono"`;
    ctx.textAlign = 'center';
    ctx.fillText(node.meta?.label || '', node.x, yPos);
  }
}
