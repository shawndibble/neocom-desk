import { vi } from 'vitest';

/**
 * Answers `window.matchMedia` so the queries `matches` accepts report as
 * matching, and every other query does not.
 *
 * jsdom's own `matchMedia` never matches anything, which `useIsDesktop`,
 * `useIsNarrow` and `useIsPhone` all read as the narrowest viewport. Pass
 * the query the test wants to be on — `DESKTOP_QUERY`, `NARROW_QUERY`,
 * `PHONE_QUERY` — or a predicate for a viewport that answers several.
 *
 * Returns a restore function. `restoreMocks` in `vite.config.ts` restores
 * the spy after each test as well, so calling it is only needed to go back
 * to the real `matchMedia` partway through one.
 */
export function stubViewport(matches: string | ((query: string) => boolean)): () => void {
  const isMatch = typeof matches === 'string' ? (query: string) => query === matches : matches;
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        media: query,
        matches: isMatch(query),
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
  return () => spy.mockRestore();
}

/** A viewport that matches nothing, which every `use…` hook reads as a phone. */
export function stubNoViewportMatch(): () => void {
  return stubViewport(() => false);
}
