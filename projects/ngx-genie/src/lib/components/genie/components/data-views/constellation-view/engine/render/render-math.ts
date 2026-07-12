/**
 * Stateless numeric helpers shared across the constellation engine and its renderers: interpolation,
 * easing, and a stable string hash. Kept dependency-free so both the engine (focus/layout tweening) and
 * the render layer (visual curves) can use one implementation.
 */

/** Linear interpolation between `start` and `end` by `t` (unclamped). */
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/** Clamp a value into the [0, 1] range. */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Smoothstep easing (3t² − 2t³) with the input clamped to [0, 1]. */
export function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate-independent easing step: the fraction to move toward a target this frame so that the
 * approach takes ~`durationMs` regardless of frame delta. `deltaMs` is clamped to 80ms to avoid huge
 * jumps after a stall.
 */
export function easedFrameStep(deltaMs: number, durationMs: number): number {
  const safeDuration = Math.max(1, durationMs);
  const safeDelta = Math.max(0, Math.min(80, deltaMs));
  return 1 - Math.pow(0.001, safeDelta / safeDuration);
}

/** Deterministic FNV-1a hash of a string → unsigned 32-bit int (stable across runs, for seeding). */
export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
