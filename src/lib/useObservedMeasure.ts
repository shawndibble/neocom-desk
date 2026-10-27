import { useEffect, useLayoutEffect, type DependencyList } from 'react';

/**
 * Re-run `measure` whenever any of the observed elements resizes. Measures once
 * on mount, then on every `ResizeObserver` callback, and disconnects on cleanup.
 *
 * `targets` runs inside the effect (so a ref's `.current` is read after mount)
 * and returns the elements to observe, or `null` to skip: no element yet, or a
 * layout that needs no measuring. The effect re-runs when `deps` change.
 * `layout` measures before paint, for a value that positions something.
 *
 * The caller owns the state and what "equal" means: `measure` sets it.
 * `layout` must stay fixed for a call site (it picks the hook). Without `ResizeObserver` (jsdom) it measures once and never again.
 */
export function useObservedMeasure(
  targets: () => readonly Element[] | null,
  measure: () => void,
  deps: DependencyList,
  { layout = false }: { layout?: boolean } = {}
): void {
  const useEffectKind = layout ? useLayoutEffect : useEffect;

  useEffectKind(() => {
    const elements = targets();
    if (!elements) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, deps);
}
