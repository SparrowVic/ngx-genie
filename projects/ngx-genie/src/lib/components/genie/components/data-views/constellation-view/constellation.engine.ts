import {NgZone} from '@angular/core';
import {CONSTELLATION_THEME, LinkAnimState, RenderLink, RenderNode} from './constellation.models';
import {constellationWorkerBody} from './constellation.worker';

export class ConstellationEngine {
  private readonly _ctx: CanvasRenderingContext2D;
  private _worker: Worker | null = null;
  private _workerObjUrl: string | null = null;
  private _animationFrameId: number = 0;
  private _destroyed = false;

  private _renderNodes = new Map<string, RenderNode>();
  private _renderLinks: RenderLink[] = [];
  private _linkAnimStates = new Map<string, LinkAnimState>();

  private _width = 800;
  private _height = 600;
  private _dpiScale = 1;
  private _viewTransform = {x: 0, y: 0, k: 1};

  private _focusedNodeIds = new Set<string>();
  private _currentFocusLevel = 0;


  private _unusedPattern: CanvasPattern | null = null;

  animationsEnabled = true;
  focusModeEnabled = true;
  isPaused = false;
  hoveredNode: RenderNode | null = null;

  constructor(
    private readonly _canvas: HTMLCanvasElement,
    private readonly _zone: NgZone,
    private readonly _onTickPositionsUpdate: (positions: { id: string, x: number, y: number }[]) => void
  ) {
    this._ctx = this._canvas.getContext('2d', {alpha: false}) as CanvasRenderingContext2D;
    this._initWorker();
    this._createUnusedPattern();
  }

  start() {
    this._zone.runOutsideAngular(() => {
      const loop = () => {
        if (this._destroyed) return;
        if (this._worker && !this.isPaused) {
          this._worker.postMessage({type: 'TICK'});
        }
        this._renderFrame();
        this._animationFrameId = requestAnimationFrame(loop);
      };
      loop();
    });
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._animationFrameId);
    if (this._worker) this._worker.terminate();
    if (this._workerObjUrl) URL.revokeObjectURL(this._workerObjUrl);
  }

  resize(width: number, height: number, dpi: number) {
    this._width = width;
    this._height = height;
    this._dpiScale = dpi;
    this._canvas.width = width * dpi;
    this._canvas.height = height * dpi;

    this._createUnusedPattern();

    if (this._worker) {
      this._worker.postMessage({type: 'RESIZE', payload: {width, height}});
    }
  }

  updateGraphData(nodes: any[], links: any[], renderNodes: Map<string, RenderNode>, renderLinks: RenderLink[]) {
    this._renderNodes = renderNodes;
    this._renderLinks = renderLinks;

    const currentLinkIds = new Set(renderLinks.map(l => l.uniqueId));
    for (const id of this._linkAnimStates.keys()) {
      if (!currentLinkIds.has(id)) this._linkAnimStates.delete(id);
    }

    if (this._worker) {
      this._worker.postMessage({
        type: 'UPDATE_DATA',
        payload: {nodes, links}
      });
    }
  }

  updatePositions(positions: { id: string, x: number, y: number }[]) {
    for (const pos of positions) {
      const node = this._renderNodes.get(pos.id);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
  }

  updateTransform(transform: { x: number, y: number, k: number }) {
    this._viewTransform = transform;
  }

  getViewTransform() {
    return {...this._viewTransform};
  }

  updatePhysics(repulsion: number) {
    if (this._worker) {
      this._worker.postMessage({
        type: 'UPDATE_PHYSICS',
        payload: {repulsion}
      });
    }
  }

  resetEntropy() {
    if (this._worker) this._worker.postMessage({type: 'RESET_ENTROPY'});
  }

  get renderNodes(): Map<string, RenderNode> {
    return this._renderNodes;
  }

  getRenderNodes(): Map<string, RenderNode> {
    return this.renderNodes;
  }

  get renderLinks(): RenderLink[] {
    return this._renderLinks;
  }

  getHitNode(clientX: number, clientY: number, rect: DOMRect): RenderNode | null {
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const {x: tx, y: ty, k: zoom} = this._viewTransform;
    const worldX = (mouseX - tx) / zoom;
    const worldY = (mouseY - ty) / zoom;

    let bestNode: RenderNode | null = null;
    const hitRadius = 20 / zoom;
    let minDistSq = hitRadius * hitRadius;

    for (const node of this._renderNodes.values()) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestNode = node;
      }
    }
    return bestNode;
  }

  setHoveredNode(node: RenderNode | null) {
    this.hoveredNode = node;
    this._updateFocusSet(node);
  }

  private _initWorker() {
    if (typeof Worker !== 'undefined') {
      try {
        const workerCode = `(${constellationWorkerBody.toString()})()`;
        const blob = new Blob([workerCode], {type: 'application/javascript'});
        this._workerObjUrl = URL.createObjectURL(blob);
        this._worker = new Worker(this._workerObjUrl);
        this._worker.onmessage = ({data}) => {
          if (data.type === 'TICK_RESULT') {
            this._onTickPositionsUpdate(data.positions);
          }
        };
      } catch (e) {
        console.error('[Engine] Worker init failed', e);
      }
    }
  }

  private _createUnusedPattern() {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(10, 0);
      ctx.stroke();
      this._unusedPattern = this._ctx.createPattern(canvas, 'repeat');
    }
  }

  private _updateFocusSet(node: RenderNode | null) {
    this._focusedNodeIds.clear();
    if (!node) return;
    this._focusedNodeIds.add(node.id);
    for (const link of this._renderLinks) {
      if (link.sourceId === node.id) this._focusedNodeIds.add(link.targetId);
      if (link.targetId === node.id) this._focusedNodeIds.add(link.sourceId);
    }
  }

  private _lerp(start: number, end: number, t: number): number {
    return start * (1 - t) + end * t;
  }

  private _renderFrame() {
    if (!this._ctx) return;
    const _ctx = this._ctx;
    const {_width, _height} = this;
    const time = performance.now();
    const dpi = this._dpiScale;

    _ctx.setTransform(1, 0, 0, 1, 0, 0);
    _ctx.fillStyle = CONSTELLATION_THEME.bg;
    _ctx.fillRect(0, 0, _width * dpi, _height * dpi);

    _ctx.scale(dpi, dpi);
    const {x: tx, y: ty, k: zoom} = this._viewTransform;

    this._drawGrid(_ctx, _width, _height, tx, ty, zoom);

    _ctx.translate(tx, ty);
    _ctx.scale(zoom, zoom);

    const targetFocusLevel = (this.focusModeEnabled && this.hoveredNode) ? 1.0 : 0.0;
    this._currentFocusLevel = this._lerp(this._currentFocusLevel, targetFocusLevel, 0.05);
    if (this._currentFocusLevel < 0.001) this._currentFocusLevel = 0;
    const isFocusActive = this._currentFocusLevel > 0.01;

    _ctx.lineCap = 'round';
    for (const link of this._renderLinks) {
      this._drawLink(_ctx, link, zoom, isFocusActive, time);
    }

    for (const node of this._renderNodes.values()) {
      this._drawNode(_ctx, node, zoom, isFocusActive, time);
    }
  }

  private _drawLink(_ctx: CanvasRenderingContext2D, link: RenderLink, zoom: number, isFocusActive: boolean, time: number) {
    const source = this._renderNodes.get(link.sourceId);
    const target = this._renderNodes.get(link.targetId);
    if (!source || !target) return;

    let linkOpacity = 0.6;
    if (isFocusActive) {
      const isRelated = this.hoveredNode && (link.sourceId === this.hoveredNode.id || link.targetId === this.hoveredNode.id);
      if (!isRelated) linkOpacity = this._lerp(1.0, 0.05, this._currentFocusLevel);
    }

    _ctx.globalAlpha = linkOpacity;

    if (link.type === 'provider') {
      const isUnused = target.meta?.isUnused;
      _ctx.beginPath();
      _ctx.moveTo(source.x, source.y);
      _ctx.lineTo(target.x, target.y);
      _ctx.strokeStyle = isUnused ? 'rgba(100, 116, 139, 0.3)' : CONSTELLATION_THEME.links.base;
      if (isUnused) _ctx.setLineDash([4, 4]);
      else _ctx.setLineDash([1, 4]);
      _ctx.lineWidth = 1 / zoom;
      _ctx.stroke();
      _ctx.setLineDash([]);
    } else if (link.type === 'component-child') {
      _ctx.beginPath();
      _ctx.moveTo(source.x, source.y);
      _ctx.lineTo(target.x, target.y);
      _ctx.strokeStyle = CONSTELLATION_THEME.injector.color;
      _ctx.lineWidth = 0.8 / zoom;
      _ctx.stroke();
    } else {
      const isUnused = target.meta?.isUnused;
      if (isUnused) {
        _ctx.beginPath();
        _ctx.moveTo(source.x, source.y);
        _ctx.lineTo(target.x, target.y);
        _ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        _ctx.setLineDash([30, 20]);
        _ctx.lineWidth = 1.5 / zoom;
        _ctx.stroke();
        _ctx.setLineDash([]);
      } else {
        const color = target.glowColor || '#fff';
        _ctx.beginPath();
        _ctx.moveTo(source.x, source.y);
        _ctx.lineTo(target.x, target.y);
        _ctx.strokeStyle = color;
        _ctx.globalAlpha = linkOpacity * 0.15;
        _ctx.lineWidth = 2 / zoom;
        _ctx.stroke();

        if (this.animationsEnabled && linkOpacity > 0.3) {
          _ctx.globalAlpha = linkOpacity;
          this._drawEnergy(_ctx, link, source, target, color, time, zoom);
        }
      }
    }
    _ctx.globalAlpha = 1.0;
  }

  private _drawEnergy(_ctx: CanvasRenderingContext2D, link: RenderLink, source: RenderNode, target: RenderNode, color: string, time: number, zoom: number) {
    let anim = this._linkAnimStates.get(link.uniqueId);
    if (!anim) {
      anim = {
        state: 'IDLE',
        stateStartTime: time,
        duration: Math.random() * 2000,
        currentSpeed: 0,
        currentLength: 0
      };
      this._linkAnimStates.set(link.uniqueId, anim);
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

          const grad = _ctx.createLinearGradient(startX, startY, endX, endY);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.5, color);
          grad.addColorStop(1, '#fff');

          _ctx.beginPath();
          _ctx.moveTo(startX, startY);
          _ctx.lineTo(endX, endY);
          _ctx.strokeStyle = grad;
          _ctx.lineWidth = 2.0 / zoom;
          _ctx.shadowBlur = 8;
          _ctx.shadowColor = color;
          _ctx.stroke();
          _ctx.shadowBlur = 0;
        }
      }
    }
  }

  private _drawNode(_ctx: CanvasRenderingContext2D, node: RenderNode, zoom: number, isFocusActive: boolean, time: number) {
    let nodeOpacity = 1.0;
    const isHighlight = this.hoveredNode === node;

    if (isFocusActive) {
      const isNeighbor = this._focusedNodeIds.has(node.id);
      if (!isHighlight && !isNeighbor) {
        nodeOpacity = this._lerp(1.0, 0.1, this._currentFocusLevel);
      }
    }

    if (node.meta?.isUnused && !this._unusedPattern) nodeOpacity *= 0.4;

    _ctx.globalAlpha = nodeOpacity;

    if (node.type === 'injector') {
      this._drawHexagon(_ctx, node, zoom, isHighlight, time);
    } else {
      const isFramework = !!node.meta?.isFramework;
      const isUnused = !!node.meta?.isUnused;
      this._drawDiamond(_ctx, node, zoom, isHighlight, time, isFramework, isUnused);
    }

    _ctx.globalAlpha = 1.0;
  }

  private _drawHexagon(_ctx: CanvasRenderingContext2D, node: RenderNode, zoom: number, isHighlight: boolean, time: number) {
    const {x, y, radius, baseColor, glowColor} = node;
    let currentAngle = node.angle || 0;
    if (this.animationsEnabled) {
      currentAngle += time * (isHighlight ? 0.002 : 0.0005);
    }

    if (isHighlight || node.meta?.isRoot) {
      _ctx.shadowBlur = isHighlight ? 30 : 15;
      _ctx.shadowColor = glowColor;
    }

    _ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const theta = currentAngle + (i * Math.PI * 2) / 6;
      _ctx[i === 0 ? 'moveTo' : 'lineTo'](x + radius * Math.cos(theta), y + radius * Math.sin(theta));
    }
    _ctx.closePath();
    _ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
    _ctx.fill();
    _ctx.shadowBlur = 0;

    _ctx.strokeStyle = baseColor;
    _ctx.lineWidth = (isHighlight ? 2 : 1.5) / zoom;
    _ctx.stroke();

    _ctx.beginPath();
    if (node.meta?.isRoot) {
      _ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
      _ctx.fillStyle = glowColor;
      _ctx.fill();
    } else {
      for (let i = 0; i < 6; i++) {
        const theta = -currentAngle * 2 + (i * Math.PI * 2) / 6;
        const r = radius * 0.5;
        _ctx[i === 0 ? 'moveTo' : 'lineTo'](x + r * Math.cos(theta), y + r * Math.sin(theta));
      }
      _ctx.closePath();
      _ctx.strokeStyle = baseColor;
      _ctx.lineWidth = 0.5 / zoom;
      _ctx.stroke();
    }

    if (isHighlight || zoom > 0.6) this._drawLabel(_ctx, node, y + radius + 12 / zoom, zoom, isHighlight);
  }

  private _drawDiamond(_ctx: CanvasRenderingContext2D, node: RenderNode, zoom: number, isHighlight: boolean, time: number, isFramework: boolean, isUnused: boolean) {
    const {x, y, radius, baseColor, glowColor} = node;
    let sizeAnim = radius;

    if (this.animationsEnabled) {
      const pulse = Math.sin((time + (node.pulseOffset || 0)) / (isFramework ? 600 : 400));
      sizeAnim = radius * (1 + pulse * 0.1);
    }


    if (isHighlight || node.meta?.isRoot) {
      _ctx.shadowBlur = isHighlight ? 20 : 10;
      _ctx.shadowColor = glowColor;
    } else if (isFramework) {
      _ctx.shadowBlur = 5;
      _ctx.shadowColor = baseColor;
    }

    _ctx.beginPath();
    _ctx.moveTo(x, y - sizeAnim);
    _ctx.lineTo(x + sizeAnim, y);
    _ctx.lineTo(x, y + sizeAnim);
    _ctx.lineTo(x - sizeAnim, y);
    _ctx.closePath();


    if (isUnused && this._unusedPattern) {
      _ctx.fillStyle = this._unusedPattern;
      _ctx.fill();
    } else if (isFramework) {

      const grad = _ctx.createLinearGradient(x - sizeAnim, y - sizeAnim, x + sizeAnim, y + sizeAnim);
      grad.addColorStop(0, 'rgba(0,0,0,0.8)');
      grad.addColorStop(0.5, baseColor + '11');
      grad.addColorStop(1, 'rgba(0,0,0,0.8)');
      _ctx.fillStyle = grad;
      _ctx.fill();
    } else {
      _ctx.fillStyle = isHighlight ? glowColor : baseColor;
      _ctx.fill();
    }


    _ctx.strokeStyle = isHighlight ? glowColor : baseColor;
    _ctx.lineWidth = (isHighlight ? 2.5 : 1.5) / zoom;
    if (isUnused) {
      _ctx.strokeStyle = '#64748b';
    }
    _ctx.stroke();

    _ctx.shadowBlur = 0;

    if (isHighlight || zoom > 0.8) this._drawLabel(_ctx, node, y + radius + 10 / zoom, zoom, isHighlight);
  }

  private _drawLabel(_ctx: CanvasRenderingContext2D, node: RenderNode, yPos: number, zoom: number, isHighlight: boolean) {
    _ctx.fillStyle = isHighlight ? '#fff' : 'rgba(226, 232, 240, 0.8)';
    if (node.meta?.isUnused) _ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';

    const fontSize = Math.max(9, 11 / zoom);
    _ctx.font = `${isHighlight ? 'bold' : ''} ${fontSize}px "JetBrains Mono"`;
    _ctx.textAlign = 'center';
    _ctx.fillText(node.meta?.label || '', node.x, yPos);
  }

  private _drawGrid(_ctx: CanvasRenderingContext2D, w: number, h: number, tx: number, ty: number, zoom: number) {
    const gridSize = 100 * zoom;
    const offsetX = (tx % gridSize);
    const offsetY = (ty % gridSize);

    _ctx.beginPath();
    for (let x = offsetX; x < w; x += gridSize) {
      _ctx.moveTo(x, 0);
      _ctx.lineTo(x, h);
    }
    for (let y = offsetY; y < h; y += gridSize) {
      _ctx.moveTo(0, y);
      _ctx.lineTo(w, y);
    }
    _ctx.strokeStyle = CONSTELLATION_THEME.grid;
    _ctx.lineWidth = 1;
    _ctx.stroke();
  }
}
