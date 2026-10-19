import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback whose identity never changes but which always calls the latest
 * `fn` — lets memoised children take inline parent handlers without
 * re-rendering.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
