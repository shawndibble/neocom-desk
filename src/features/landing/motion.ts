export function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return true;
}
