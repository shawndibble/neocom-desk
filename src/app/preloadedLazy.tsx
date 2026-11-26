import { lazy, type ComponentType } from 'react';
import type { RememberedLoader } from './routeChunks';

export function preloadedLazy<P extends object>(load: RememberedLoader<P>): ComponentType<P> {
  const build = () =>
    lazy(() =>
      load().catch((error: unknown) => {
        Lazy = build();
        throw error;
      })
    );
  let Lazy = build();
  function Preloaded(props: P) {
    const Loaded = load.peek();
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }
  return Preloaded;
}
