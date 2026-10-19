import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFeedStore } from './feedStore';
import { FeedStoreContext } from './feedStoreContext';
import { useKindViews, type ViewRequest } from './useWidgetView';

const REQUESTS: ViewRequest[] = [{ kind: 'mail', scopeAll: false }];

function setup() {
  const store = createFeedStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeedStoreContext.Provider value={store}>{children}</FeedStoreContext.Provider>
  );
  let renders = 0;
  const hook = renderHook(
    () => {
      renders += 1;
      return useKindViews([...REQUESTS]);
    },
    { wrapper }
  );
  return { store, hook, renders: () => renders };
}

describe('useKindViews', () => {
  it('keeps the same views when a feed the kind does not read updates', () => {
    const { store, hook, renders } = setup();
    const before = hook.result.current;
    const rendered = renders();
    act(() => store.set('wallet', { data: null, error: false, loading: true }));
    expect(renders()).toBe(rendered);
    expect(hook.result.current).toBe(before);
  });

  it('rebuilds when a feed the kind reads updates', () => {
    const { store, hook } = setup();
    const before = hook.result.current;
    act(() => store.set('mail', { data: null, error: true, loading: false }));
    expect(hook.result.current).not.toBe(before);
  });
});
