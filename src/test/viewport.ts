import { vi } from 'vitest';

const noop = () => {};
const noopFalse = () => false;

/**
 * A `MediaQueryList` answering `matches` for `media`, with inert listeners.
 * `vitest.setup.dom.ts` builds the suite's never-matching default from this,
 * so the shape lives in one place.
 */
export function fakeMediaQueryList(media: string, matches: boolean): MediaQueryList {
  return {
    media,
    matches,
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: noopFalse,
  } as unknown as MediaQueryList;
}

/**
 * Replaces `window.matchMedia` so that only the queries `matches` accepts
 * report as matching. Pass the one query the test wants to be on —
 * `DESKTOP_QUERY`, `NARROW_QUERY`, `PHONE_QUERY`, `MD_UP_QUERY` — or a
 * predicate when the component under test reads more than one.
 *
 * A query the stub is not given answers `false`, which is not the same as
 * the next breakpoint down: `PHONE_QUERY` and `NARROW_QUERY` are
 * `max-width` forms, so `stubViewport(DESKTOP_QUERY)` is a viewport that is
 * neither phone nor narrow, while `stubViewport(PHONE_QUERY)` leaves
 * `useIsNarrow` false even though a real phone is narrow. Name every query
 * the component reads, through a predicate, when that distinction matters.
 *
 * Returns a restore function for getting the real `matchMedia` back partway
 * through a test. `restoreMocks` in `vite.config.ts` restores the spy after
 * every test either way, so a call at the end of one is belt and braces.
 */
export function stubViewport(matches: string | ((query: string) => boolean)): () => void {
  const isMatch = typeof matches === 'string' ? (query: string) => query === matches : matches;
  const spy = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query: string) => fakeMediaQueryList(query, isMatch(query)));
  return () => spy.mockRestore();
}

/**
 * A viewport where nothing matches. This is already the suite default (see
 * `vitest.setup.dom.ts`), so it is only worth calling to undo a wider stub
 * for one block, as the phone tests in `AppraisalPanel.test.tsx` do.
 */
export function stubNoViewportMatch(): () => void {
  return stubViewport(noopFalse);
}
