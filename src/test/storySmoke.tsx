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

setProjectAnnotations(preview.default);

const storyContext = new AsyncLocalStorage<string>();

const refused: { request: string; owner: string | undefined }[] = [];

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
        const page = Boolean((Story as { parameters?: { shell?: unknown } }).parameters?.shell);
        await (Story as { load?: () => Promise<void> }).load?.();
        const { container, unmount } = render(<Story />);
        await waitFor(() => expect(container).not.toBeEmptyDOMElement());
        if (page) {
          await waitFor(() => expect(container.querySelector('[data-shell-ready]')).not.toBeNull());
        }
        if (!page) expect(networkRequestsOf(id)).toEqual([]);
        unmount();
        await whenFixturesRetired();
        if (!page) expect(networkRequestsOf(id)).toEqual([]);
      });
    });
  });
}
