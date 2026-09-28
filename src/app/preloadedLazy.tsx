import { lazy, type ComponentType } from 'react';
import type { RememberedLoader } from './routeChunks';

/**
 * `React.lazy`, minus the suspend when the chunk is already here.
 *
 * A plain `lazy()` suspends on its first render even if the module finished
 * loading long before — its loader hands back a promise, and a promise is
 * never read synchronously — so the Suspense fallback gets a frame. For the
 * signed-in shell that frame is exactly what a returning user would see on
 * every cold load, and the boot preload (`bootShellPreload.ts`) usually has
 * the chunk in hand by then. So: render the loaded component outright when
 * there is one, and fall back to `lazy()` only when there is not.
 *
 * The switch cannot remount anything: the `lazy()` branch only ever renders
 * while the chunk is missing, which means it suspends and never commits; by
 * the retry, `peek()` has the component (the loader records it before the
 * promise `lazy()` waits on settles).
 */
export function preloadedLazy<P extends object>(load: RememberedLoader<P>): ComponentType<P> {
  const Lazy = lazy(load);
  function Preloaded(props: P) {
    const Loaded = load.peek();
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }
  return Preloaded;
}
