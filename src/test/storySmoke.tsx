import type { ComponentType } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../.storybook/preview';
import { unexpectedRequests, whenFetchQuiet, whenFixturesRetired } from '@/storybook/fixtureFetch';

// Every story is also a smoke test: it must render with the same decorators
// Storybook gives it. Runs in the existing `dom` Vitest project, so the CI
// `test` shards pick it up and no new required check appears.
//
// One file is one worker, and ~570 stories took a minute in a single file, so
// the smoke is split across `smoke/*.test.tsx`, each globbing its own slice and
// calling this. `smoke/rest.test.tsx` negates every other slice's patterns, so
// a new story file is covered by default and none can fall between them.
setProjectAnnotations(preview.default);

/**
 * Between stories no fixture table is installed and `fetch` is the real one. CI
 * is offline, where a real request hangs until its timeout (15 s for Fuzzwork),
 * so a page's late request failed long after its story, and its fallback's
 * request was blamed on whichever story was rendering by then. Refusing at once
 * keeps a late request and its fallback inside the gap. Same-origin (the SDE
 * bake) still passes through.
 */
function refuseCrossOriginFetch(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin === location.origin) return real(input, init);
    return Promise.reject(new TypeError(`Story smoke is offline: ${url.origin}${url.pathname}`));
  };
  return () => {
    globalThis.fetch = real;
  };
}

export function describeStorySmoke(modules: Record<string, Record<string, unknown>>) {
  let restoreNetwork: (() => void) | undefined;
  beforeAll(() => {
    restoreNetwork = refuseCrossOriginFetch();
  });
  afterAll(() => restoreNetwork?.());
  describe.each(Object.entries(modules))('%s', (_file, mod) => {
    const stories = composeStories(mod as Parameters<typeof composeStories>[0]) as Record<
      string,
      ComponentType
    >;
    it.each(Object.entries(stories))('%s renders', async (_name, Story) => {
      const { container, unmount } = render(<Story />);
      // A page story seeds its account first, so it paints a tick later.
      await waitFor(() => expect(container).not.toBeEmptyDOMElement());
      if ((Story as { parameters?: { shell?: unknown } }).parameters?.shell) {
        await waitFor(() => expect(container.querySelector('[data-shell-ready]')).not.toBeNull());
        await whenFetchQuiet();
      }
      // ...and a page story that reaches for an endpoint it has no fixture for
      // would otherwise just show an empty state.
      expect(unexpectedRequests()).toEqual([]);
      // A page's work can outlive its story. It drains here, against this story's
      // fixtures, so a late request is answered or blamed on this story, never on
      // the next one, whose install resets the record (#6113).
      unmount();
      await whenFixturesRetired();
      expect(unexpectedRequests()).toEqual([]);
    });
  });
}
