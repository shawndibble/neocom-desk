import { AsyncLocalStorage } from 'node:async_hooks';
import type { ComponentType } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../.storybook/preview';
import {
  attributeRequestsTo,
  unexpectedRequests,
  whenFixturesRetired,
} from '@/storybook/fixtureFetch';

// Every story is also a smoke test: it must render with the same decorators
// Storybook gives it. Runs in the existing `dom` Vitest project, so the CI
// `test` shards pick it up and no new required check appears.
//
// One file is one worker, and ~570 stories took a minute in a single file, so
// the smoke is split across `smoke/*.test.tsx`, each globbing its own slice and
// calling this. `smoke/rest.test.tsx` negates every other slice's patterns, so
// a new story file is covered by default and none can fall between them.
// Mockups (`src/mockups/**`) are design throwaways and are not smoke-tested;
// typecheck and `src/mockups/mockups.test.ts` still cover them.
setProjectAnnotations(preview.default);

/**
 * The story whose render started the current async chain (timers, promises and
 * effects carry it). Every refused or unmatched request is stamped with it, so a
 * request that outlives its story is blamed on that story, never on the one
 * mounted when it lands (#6113, #6114, #6126).
 */
const storyContext = new AsyncLocalStorage<string>();

/** Cross-origin requests refused while no fixture table was installed. */
const refused: { request: string; owner: string | undefined }[] = [];

/**
 * Only page stories install a fixture table; otherwise `fetch` would be the real
 * one. CI is offline, where a real request hangs until its timeout (15 s for
 * Fuzzwork), so a page's late request failed long after its story. Refusing at
 * once keeps a late request and its fallback inside the gap, and a component
 * story that reaches for a production endpoint is recorded. Same-origin (the
 * SDE bake) still passes through.
 */
function refuseCrossOriginFetch(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin === location.origin) return real(input, init);
    const request = `${(init?.method ?? 'GET').toUpperCase()} ${url.origin}${url.pathname}`;
    refused.push({ request, owner: storyContext.getStore() });
    return Promise.reject(new TypeError(`Story smoke is offline: ${request}`));
  };
  return () => {
    globalThis.fetch = real;
  };
}

/** Requests `id` made that reached the network or matched no fixture. */
function networkRequestsOf(id: string): readonly string[] {
  return [
    ...unexpectedRequests(id),
    ...refused.filter((entry) => entry.owner === id).map((entry) => entry.request),
  ];
}

export function describeStorySmoke(modules: Record<string, Record<string, unknown>>) {
  let restoreNetwork: (() => void) | undefined;
  let stopAttributing: (() => void) | undefined;
  beforeAll(() => {
    restoreNetwork = refuseCrossOriginFetch();
    stopAttributing = attributeRequestsTo(() => storyContext.getStore());
  });
  afterAll(() => {
    stopAttributing?.();
    restoreNetwork?.();
  });
  describe.each(Object.entries(modules))('%s', (file, mod) => {
    const stories = composeStories(mod as Parameters<typeof composeStories>[0]) as Record<
      string,
      ComponentType
    >;
    it.each(Object.entries(stories))('%s renders', (name, Story) => {
      const id = `${file}:${name}`;
      return storyContext.run(id, async () => {
        // Page stories (`parameters.shell`) run the whole app, so they are checked
        // for rendering only: their data is the route tests' job, and their late
        // requests made this smoke the repo's most-fixed flake.
        const page = Boolean((Story as { parameters?: { shell?: unknown } }).parameters?.shell);
        // Storybook runs a story's `loaders` (seed Dexie) before it renders.
        await (Story as { load?: () => Promise<void> }).load?.();
        const { container, unmount } = render(<Story />);
        // A page story seeds its account first, so it paints a tick later.
        await waitFor(() => expect(container).not.toBeEmptyDOMElement());
        if (page) {
          await waitFor(() => expect(container.querySelector('[data-shell-ready]')).not.toBeNull());
        }
        // A component story that reaches for an endpoint it has no fixture for
        // would otherwise just show an empty state, and in production make a real
        // request.
        if (!page) expect(networkRequestsOf(id)).toEqual([]);
        // A story's work can outlive it. It drains here, against this story's
        // fixtures, so a late request is answered rather than sent to the network.
        unmount();
        await whenFixturesRetired();
        if (!page) expect(networkRequestsOf(id)).toEqual([]);
      });
    });
  });
}
