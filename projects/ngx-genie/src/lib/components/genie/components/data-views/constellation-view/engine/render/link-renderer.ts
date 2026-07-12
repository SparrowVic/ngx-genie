import {CONSTELLATION_THEME, RenderLink, RenderNode} from '../../models/constellation.models';
import {lerp, stableHash} from './render-math';
import {FrameContext, RenderScene, ViewBounds, VisibleLinkCandidates} from './render-types';

/** Link opacity for edges not touching the focused node while focus mode is active. */
const FOCUS_DIM_LINK_OPACITY = 0.24;
/** Per-type cap on how many visible links are collected for a huge-graph frame. */
const VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE = 36000;

interface VisibleLinkCandidatesCache {
  key: string;
  candidates: VisibleLinkCandidates;
}

/**
 * Draws the graph's edges: provider/component/dependency lines, curved aggregate edges, animated energy
 * pulses, and the zoomed-out dependency-density halos. For huge graphs it first collects the links whose
 * endpoints are both visible (cached per frame-identity) and draws type-bucketed batches under adaptive
 * caps; small graphs draw every link directly. Stateless apart from its own candidate cache.
 */
export class ConstellationLinkRenderer {
  private _candidateCache: VisibleLinkCandidatesCache | null = null;

  constructor(private readonly _scene: RenderScene) {}

  /** Drop the cached visible-link set (the engine calls this when frame caches are invalidated). */
  invalidateCache(): void {
    this._candidateCache = null;
  }

  /** Draw the frame's links. `candidates` is required for huge graphs; small graphs ignore it. */
  draw(frame: FrameContext, renderableNodes: RenderNode[], candidates: VisibleLinkCandidates | null): void {
    const {zoom} = frame;

    if (!frame.hugeGraph) {
      this._drawBatch(frame, this._scene.renderLinks, Number.POSITIVE_INFINITY);
      return;
    }

    const visibleLinks = candidates ?? this.collectVisibleCandidates(renderableNodes);

    if (frame.linkRenderMode === 'all') {
      if (zoom < 2.2) this._drawBatch(frame, visibleLinks.aggregateLinks, zoom > 1.1 ? 7000 : 3600);
      this._drawBatch(frame, visibleLinks.componentLinks, zoom > 1.1 ? 10000 : 3500);
      this._drawBatch(frame, visibleLinks.providerLinks, zoom > 1.1 ? 12000 : 4500);
      this._drawBatch(frame, visibleLinks.dependencyLinks, zoom > 1.8 ? 14000 : 6000);
      return;
    }

    const structuralCap = zoom > 1.1 ? 7000 : 2600;
    if (zoom < 2.1) {
      this._drawBatch(frame, visibleLinks.aggregateLinks, zoom > 0.9 ? 5200 : 2800);
    }
    this._drawBatch(frame, visibleLinks.componentLinks, structuralCap);

    if (frame.linkRenderMode !== 'focused' && zoom > 0.45) {
      this._drawBatch(frame, visibleLinks.providerLinks, zoom > 1.2 ? 6500 : 1800);
    }

    if (frame.activeFocusNode) {
      const focusedLinks = this._scene.linksByNodeId.get(frame.activeFocusNode.id) ?? [];
      this._drawBatch(frame, focusedLinks, zoom > 1.5 ? 4000 : 1800);
      return;
    }

    if (frame.linkRenderMode === 'adaptive' && zoom > 2.2) {
      this._drawBatch(frame, visibleLinks.dependencyLinks, this._adaptiveDependencyCap(zoom));
    }
  }

  /** Collect the links whose endpoints are both currently visible, bucketed by type (huge graphs). */
  collectVisibleCandidates(renderableNodes: RenderNode[]): VisibleLinkCandidates {
    const cacheKey = `${this._scene.renderDataVersion}:${this._scene.renderableNodesKey}:${renderableNodes.length}`;
    if (this._candidateCache?.key === cacheKey) {
      return this._candidateCache.candidates;
    }

    const providerLinks: RenderLink[] = [];
    const dependencyLinks: RenderLink[] = [];
    const componentLinks: RenderLink[] = [];
    const aggregateLinks: RenderLink[] = [];
    const visibleIds = new Set<string>();
    const seenLinkIds = new Set<string>();

    for (const node of renderableNodes) {
      visibleIds.add(node.id);
    }

    for (const node of renderableNodes) {
      const links = this._scene.linksByNodeId.get(node.id);
      if (!links) continue;

      for (const link of links) {
        if (seenLinkIds.has(link.uniqueId)) continue;
        if (!visibleIds.has(link.sourceId) || !visibleIds.has(link.targetId)) continue;

        seenLinkIds.add(link.uniqueId);

        if (link.type === 'provider') {
          if (providerLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) providerLinks.push(link);
        } else if (link.type === 'dependency') {
          if (dependencyLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) dependencyLinks.push(link);
        } else if (link.type === 'component-child') {
          if (componentLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) componentLinks.push(link);
        } else if (aggregateLinks.length < VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE) {
          aggregateLinks.push(link);
        }

        if (
          providerLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
          && dependencyLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
          && componentLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
          && aggregateLinks.length >= VISIBLE_LINK_CANDIDATE_LIMIT_PER_TYPE
        ) {
          return this._cacheCandidates(cacheKey, {providerLinks, dependencyLinks, componentLinks, aggregateLinks});
        }
      }
    }

    return this._cacheCandidates(cacheKey, {providerLinks, dependencyLinks, componentLinks, aggregateLinks});
  }

  /** Faint halos around high-degree nodes when zoomed out on a huge graph (a density hint for edges). */
  drawDensity(frame: FrameContext, renderableNodes: RenderNode[]): void {
    const {ctx, zoom} = frame;
    if (!frame.hugeGraph || frame.linkRenderMode === 'all' || zoom > 2.5) return;

    ctx.save();
    ctx.setLineDash([]);
    for (const node of renderableNodes) {
      const degree = this._scene.dependencyDegreeByNodeId.get(node.id) ?? 0;
      if (degree < 4) continue;

      const intensity = Math.min(1, Math.log2(degree + 1) / 12);
      const radius = node.radius + 8 + intensity * 24;
      const alpha = (frame.isFocusActive ? 0.085 : 0.12) * intensity;
      const position = this._scene.getDisplayPosition(node);

      ctx.beginPath();
      ctx.arc(position.x, position.y, radius / Math.max(zoom, 0.35), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.lineWidth = Math.max(0.6, 1.4 / zoom);
      ctx.stroke();
    }
    ctx.restore();
  }

  private _cacheCandidates(key: string, candidates: VisibleLinkCandidates): VisibleLinkCandidates {
    this._candidateCache = {key, candidates};
    return candidates;
  }

  private _drawBatch(frame: FrameContext, links: RenderLink[], limit: number): void {
    let drawn = 0;
    let checked = 0;
    const maxChecked = Number.isFinite(limit) ? Math.max(3000, limit * 14) : Number.POSITIVE_INFINITY;
    for (const link of links) {
      if (drawn >= limit) return;
      if (checked >= maxChecked) return;
      checked++;
      if (this._drawLink(frame, link)) {
        drawn++;
      }
    }
  }

  private _adaptiveDependencyCap(zoom: number): number {
    if (zoom > 3.5) return 6000;
    if (zoom > 2.8) return 4200;
    return 2400;
  }

  private _drawLink(frame: FrameContext, link: RenderLink): boolean {
    const {ctx, zoom, isFocusActive, bounds} = frame;
    const source = this._scene.renderNodes.get(link.sourceId);
    const target = this._scene.renderNodes.get(link.targetId);
    if (!source || !target) return false;
    const sourcePosition = this._scene.getDisplayPosition(source);
    const targetPosition = this._scene.getDisplayPosition(target);
    if (!this._linkInBounds(sourcePosition, targetPosition, bounds)) return false;

    const sourceOriginal = {x: source.x, y: source.y};
    const targetOriginal = {x: target.x, y: target.y};
    source.x = sourcePosition.x;
    source.y = sourcePosition.y;
    target.x = targetPosition.x;
    target.y = targetPosition.y;

    try {
      let linkOpacity = 0.6;
      if (isFocusActive) {
        const activeFocusNode = frame.activeFocusNode;
        const isRelated = activeFocusNode && (link.sourceId === activeFocusNode.id || link.targetId === activeFocusNode.id);
        if (!isRelated) linkOpacity = lerp(1.0, FOCUS_DIM_LINK_OPACITY, frame.focusLevel);
      }

      ctx.globalAlpha = linkOpacity;

      if (link.type === 'provider') {
        const isUnused = target.meta?.isUnused;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isUnused ? 'rgba(100, 116, 139, 0.3)' : CONSTELLATION_THEME.links.base;
        if (isUnused) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([1, 4]);
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (link.type === 'component-child') {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = CONSTELLATION_THEME.injector.color;
        ctx.lineWidth = 0.8 / zoom;
        ctx.stroke();
      } else if (link.type === 'aggregate-dependency') {
        this._drawAggregate(frame, source, target, link, linkOpacity);
      } else {
        const isUnused = target.meta?.isUnused;
        if (isUnused) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
          ctx.setLineDash([30, 20]);
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const color = target.glowColor || '#fff';
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = color;
          ctx.globalAlpha = linkOpacity * 0.15;
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();

          if (frame.animateVisuals && this._scene.renderLinks.length <= this.animatedLinkLimit(frame.hugeGraph) && linkOpacity > 0.3) {
            ctx.globalAlpha = linkOpacity;
            this._drawEnergy(frame, link, source, target, color);
          }
        }
      }
      ctx.globalAlpha = 1.0;
      return true;
    } finally {
      source.x = sourceOriginal.x;
      source.y = sourceOriginal.y;
      target.x = targetOriginal.x;
      target.y = targetOriginal.y;
    }
  }

  private _drawAggregate(
    frame: FrameContext,
    source: RenderNode,
    target: RenderNode,
    link: RenderLink,
    linkOpacity: number
  ): void {
    const {ctx, zoom} = frame;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const hash = stableHash(link.uniqueId);
    const direction = (hash & 1) === 0 ? 1 : -1;
    const curve = Math.min(220, Math.max(34, distance * 0.12)) * direction;
    const controlX = (source.x + target.x) / 2 + normalX * curve;
    const controlY = (source.y + target.y) / 2 + normalY * curve;
    const weight = Math.max(1, link.weight ?? 1);
    const intensity = Math.min(1, Math.log2(weight + 1) / 9);

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
    ctx.strokeStyle = `rgba(20, 184, 166, ${0.12 + intensity * 0.28})`;
    ctx.globalAlpha = linkOpacity * (0.46 + intensity * 0.32);
    ctx.lineWidth = Math.max(1.1, 1.2 + intensity * 4.4) / Math.max(zoom, 0.0005);
    ctx.stroke();

    if (intensity > 0.35) {
      ctx.globalAlpha = linkOpacity * 0.14 * intensity;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
      ctx.strokeStyle = '#5eead4';
      ctx.lineWidth = Math.max(2.8, 4.8 * intensity) / Math.max(zoom, 0.0005);
      ctx.stroke();
    }
  }

  private _drawEnergy(
    frame: FrameContext,
    link: RenderLink,
    source: RenderNode,
    target: RenderNode,
    color: string
  ): void {
    const {ctx, zoom, time} = frame;
    let anim = this._scene.linkAnimStates.get(link.uniqueId);
    if (!anim) {
      anim = {
        state: 'IDLE',
        stateStartTime: time,
        duration: Math.random() * 2000,
        currentSpeed: 0,
        currentLength: 0
      };
      this._scene.linkAnimStates.set(link.uniqueId, anim);
    }

    const elapsed = time - anim.stateStartTime;
    const dist = Math.hypot(target.x - source.x, target.y - source.y);

    if (elapsed > anim.duration) {
      if (anim.state === 'IDLE') {
        anim.state = 'SHOOTING';
        anim.stateStartTime = time;
        const baseSpeed = 150 + Math.random() * 300;
        const distFactor = Math.min(1.0, Math.max(0.4, dist / 200));
        anim.currentSpeed = baseSpeed * distFactor;
        anim.duration = (dist / anim.currentSpeed) * 1000;
        anim.currentLength = 50 + Math.random() * (Math.min(150, dist * 0.8) - 50);
      } else {
        anim.state = 'IDLE';
        anim.stateStartTime = time;
        anim.duration = 1000 + Math.random() * 2000;
      }
    }

    if (anim.state === 'SHOOTING') {
      const t = (time - anim.stateStartTime) / anim.duration;
      const headDist = t * dist;
      const tailDist = headDist - anim.currentLength;

      if (tailDist < dist && headDist > 0) {
        const visibleStart = Math.max(0, tailDist);
        const visibleEnd = Math.min(dist, headDist);
        if (visibleStart < visibleEnd) {
          const tStart = visibleStart / dist;
          const tEnd = visibleEnd / dist;

          const startX = source.x + (target.x - source.x) * tStart;
          const startY = source.y + (target.y - source.y) * tStart;
          const endX = source.x + (target.x - source.x) * tEnd;
          const endY = source.y + (target.y - source.y) * tEnd;

          const grad = ctx.createLinearGradient(startX, startY, endX, endY);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.5, color);
          grad.addColorStop(1, '#fff');

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2.0 / zoom;
          ctx.shadowBlur = 8;
          ctx.shadowColor = color;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  /** Max links for which energy pulses animate — huge graphs disable them (0). */
  animatedLinkLimit(hugeGraph: boolean): number {
    if (hugeGraph) return 0;
    return 2000;
  }

  private _linkInBounds(source: {x: number; y: number}, target: {x: number; y: number}, bounds: ViewBounds): boolean {
    return Math.max(source.x, target.x) >= bounds.left
      && Math.min(source.x, target.x) <= bounds.right
      && Math.max(source.y, target.y) >= bounds.top
      && Math.min(source.y, target.y) <= bounds.bottom;
  }
}
