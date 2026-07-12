import { Injectable, computed, signal } from '@angular/core';

/**
 * SignalLabService — a tiny reactive store, deliberately provided at the
 * component level (see SignalLabComponent's `providers`) rather than in root.
 * That makes it a perfect specimen for the GenieOS overlay: press F1 and it
 * appears as an *element* injector service, distinct from the app-wide root
 * services, with every signal and computed updating live in the inspector.
 */
@Injectable()
export class SignalLabService {
  /** The mutable core value. */
  private readonly _count = signal(0);
  readonly count = this._count.asReadonly();

  /** How far each increment/decrement moves the count. */
  private readonly _step = signal(1);
  readonly step = this._step.asReadonly();

  /** Every value the count has held this session — feeds the sparkline. */
  private readonly _history = signal<number[]>([0]);
  readonly history = this._history.asReadonly();

  /** Derived state — pure computed() graphs the inspector can trace. */
  readonly doubled = computed(() => this._count() * 2);
  readonly squared = computed(() => this._count() * this._count());
  readonly isEven = computed(() => this._count() % 2 === 0);
  readonly parity = computed(() => (this.isEven() ? 'even' : 'odd'));

  readonly historyLength = computed(() => this._history().length);
  readonly peak = computed(() => Math.max(...this._history()));
  readonly trough = computed(() => Math.min(...this._history()));

  /** A human-readable summary of the whole store, recomputed on any change. */
  readonly label = computed(
    () => `count = ${this._count()} · ${this.parity()} · doubled = ${this.doubled()}`,
  );

  /** Clamp the step to a sane positive integer before storing it. */
  setStep(step: number): void {
    const safe = Number.isFinite(step) ? Math.max(1, Math.round(step)) : 1;
    this._step.set(safe);
  }

  increment(): void {
    this.commit(this._count() + this._step());
  }

  decrement(): void {
    this.commit(this._count() - this._step());
  }

  reset(): void {
    this._count.set(0);
    this._history.set([0]);
  }

  /** Store the next value and append it to a bounded history window. */
  private commit(next: number): void {
    this._count.set(next);
    this._history.update((h) => [...h, next].slice(-28));
  }
}
