import {CONSTELLATION_WORKER_SOURCE} from '../worker/constellation.worker';

/** What the physics controller needs from the engine to decide when/whether to tick. */
export interface PhysicsControllerDeps {
  /** Apply positions returned by the worker (only called for live force layouts). */
  onTickResult(positions: { id: string; x: number; y: number }[]): void;
  /** Static (atlas/organic) layouts are position-frozen and never simulated. */
  isStaticLayout(): boolean;
  /** Current simulated node count (drives the tick cadence). */
  getNodeCount(): number;
  isHugeGraph(): boolean;
}

/**
 * Owns the physics Web Worker and the tick scheduling for the constellation. The engine delegates all
 * worker interaction here: it forwards graph/physics/size changes, calls {@link maybeTick} once per
 * animation frame, and reads {@link settled} to know when the layout has stopped moving. Isolating
 * this keeps the worker lifecycle and settle logic out of the render engine.
 */
export class ConstellationPhysicsController {
  private _worker: Worker | null = null;
  private _workerObjUrl: string | null = null;
  private _tickPending = false;
  private _settled = false;
  private _lastTickAt = 0;

  constructor(private readonly _deps: PhysicsControllerDeps) {
    this._init();
  }

  /** True once the worker reports the simulation has stopped moving (so the engine can stop ticking). */
  get settled(): boolean {
    return this._settled;
  }

  /** Dispatch one physics tick if the layout is live, unpaused, not already pending, and due. */
  maybeTick(now: number, isPaused: boolean): void {
    if (this._worker && !isPaused && this._canDispatch(now)) {
      this._tickPending = true;
      this._lastTickAt = now;
      this._worker.postMessage({type: 'TICK'});
    }
  }

  /** Swap in a new graph; the simulation wakes and re-settles from here. */
  setData(nodes: unknown[], links: unknown[]): void {
    this._tickPending = false;
    this._settled = false;
    if (this._worker) this._worker.postMessage({type: 'UPDATE_DATA', payload: {nodes, links}});
  }

  updateRepulsion(repulsion: number): void {
    this._settled = false;
    if (this._worker) this._worker.postMessage({type: 'UPDATE_PHYSICS', payload: {repulsion}});
  }

  resize(width: number, height: number): void {
    if (this._worker) this._worker.postMessage({type: 'RESIZE', payload: {width, height}});
  }

  resetEntropy(): void {
    this._settled = false;
    if (this._worker) this._worker.postMessage({type: 'RESET_ENTROPY'});
  }

  destroy(): void {
    if (this._worker) this._worker.terminate();
    if (this._workerObjUrl) URL.revokeObjectURL(this._workerObjUrl);
  }

  private _init(): void {
    if (typeof Worker === 'undefined') return;
    try {
      const blob = new Blob([CONSTELLATION_WORKER_SOURCE], {type: 'application/javascript'});
      this._workerObjUrl = URL.createObjectURL(blob);
      this._worker = new Worker(this._workerObjUrl);
      this._worker.onmessage = ({data}) => {
        if (data.type === 'TICK_RESULT') {
          this._tickPending = false;
          // The worker reports when the simulation has settled so we can stop ticking it.
          this._settled = !!data.settled;
          // A TICK_RESULT arriving while static is a stale force result from before the layout switched
          // (static layouts never dispatch a TICK); applying it would corrupt the frozen positions.
          if (this._deps.isStaticLayout()) return;
          this._deps.onTickResult(data.positions);
        }
      };
      this._worker.onerror = () => {
        this._tickPending = false;
      };
    } catch (e) {
      console.error('[Engine] Worker init failed', e);
    }
  }

  private _canDispatch(now: number): boolean {
    if (this._deps.isStaticLayout()) return false;
    if (this._tickPending) return false;
    // Stop ticking once the layout has settled — no visible movement, so it is pure wasted CPU.
    if (this._settled) return false;
    return now - this._lastTickAt >= this._tickInterval();
  }

  private _tickInterval(): number {
    const count = this._deps.getNodeCount();
    if (this._deps.isHugeGraph()) return 220;
    if (count > 6000) return 120;
    if (count > 3000) return 80;
    if (count > 1200) return 48;
    if (count > 500) return 32;
    return 16;
  }
}
