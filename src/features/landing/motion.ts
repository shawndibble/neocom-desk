/**
 * Whether the landing page may animate at all: an IntersectionObserver exists
 * (so there is a way to know when to start) and the visitor has not asked for
 * reduced motion. Anything that hides content until it moves must check this
 * first, so the no-motion path is the fully visible one.
 */
export function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return true;
}
