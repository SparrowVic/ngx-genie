/**
 * Shared prefers-reduced-motion probe for the motion directives. The
 * MediaQueryList is created lazily and cached; `.matches` stays live, so
 * re-reading it per event reflects OS-level changes without extra listeners.
 * Returns false on non-browser platforms so SSR stays inert.
 */
let query: MediaQueryList | undefined;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  query ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return query.matches;
}
