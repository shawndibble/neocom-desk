import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../.storybook/preview';
import { unexpectedRequests, whenFetchQuiet } from '@/storybook/fixtureFetch';

// Every story is also a smoke test: it must render with the same decorators
// Storybook gives it. Runs in the existing `dom` Vitest project, so the CI
// `test` shards pick it up and no new required check appears.
//
// One file is one worker, and ~570 stories took a minute in a single file, so
// the smoke is split across `smoke/*.test.tsx`, each globbing its own slice and
// calling this. `smoke/rest.test.tsx` negates every other slice's patterns, so
// a new story file is covered by default and none can fall between them.
setProjectAnnotations(preview.default);

export function describeStorySmoke(modules: Record<string, Record<string, unknown>>) {
  describe.each(Object.entries(modules))('%s', (_file, mod) => {
    const stories = composeStories(mod as Parameters<typeof composeStories>[0]) as Record<
      string,
      ComponentType
    >;
    it.each(Object.entries(stories))('%s renders', async (_name, Story) => {
      const { container } = render(<Story />);
      // A page story seeds its account first, so it paints a tick later.
      await waitFor(() => expect(container).not.toBeEmptyDOMElement());
      if ((Story as { parameters?: { shell?: unknown } }).parameters?.shell) {
        await waitFor(() => expect(container.querySelector('[data-shell-ready]')).not.toBeNull());
        await whenFetchQuiet();
      }
      // ...and a page story that reaches for an endpoint it has no fixture for
      // would otherwise just show an empty state.
      expect(unexpectedRequests()).toEqual([]);
    });
  });
}
