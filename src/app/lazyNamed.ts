import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { guarded } from './routeChunks';

export function lazyNamed<K extends string, P extends object>(
  importer: () => Promise<Record<K, ComponentType<P>>>,
  key: K
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => guarded(importer).then((m) => ({ default: m[key] })));
}
