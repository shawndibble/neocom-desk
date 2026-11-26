import { vi } from 'vitest';

const noop = () => {};
const noopFalse = () => false;

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

export function stubViewport(matches: string | ((query: string) => boolean)): () => void {
  const isMatch = typeof matches === 'string' ? (query: string) => query === matches : matches;
  const spy = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query: string) => fakeMediaQueryList(query, isMatch(query)));
  return () => spy.mockRestore();
}

export function stubNoViewportMatch(): () => void {
  return stubViewport(noopFalse);
}
