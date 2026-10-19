import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { guarded } from './routeChunks';

/**
 * `lazy()` for a component that takes props, from a named export: `named`'s
 * re-shape and undefined-module guard, but typed to keep the props. Lives
 * outside `routeChunks.ts`, which the boot preload imports and must not pull
 * in a runtime `react`.
 */
export function lazyNamed<K extends string, P extends object>(
  importer: () => Promise<Record<K, ComponentType<P>>>,
  key: K
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => guarded(importer).then((m) => ({ default: m[key] })));
}
