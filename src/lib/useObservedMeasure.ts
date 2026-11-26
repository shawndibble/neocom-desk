import { useEffect, useLayoutEffect, type DependencyList } from 'react';

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
