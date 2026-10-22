import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { CORP_DEFS } from './corpModels';
import { createFeedStore } from './feedStore';
import { FeedStoreContext } from './feedStoreContext';
import { registerKindDefs } from './models';
import { useKindViews, type ViewRequest } from './useWidgetView';

registerKindDefs(CORP_DEFS);

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

  describe('on the Time format clock', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
      useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
      vi.useRealTimers();
    });

    it('rebuilds the corp deadline strip on EVE days when the setting changes', () => {
      process.env.TZ = 'America/Los_Angeles';
      vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 11, 12) });
      const store = createFeedStore();
      const fetchedAt = new Date(Date.UTC(2026, 9, 11, 11));
      // Fuel runs out at 22:00 tonight in Los Angeles, which is already the next EVE day.
      store.set('structures', {
        data: {
          structures: [
            {
              structureId: 1,
              name: 'Efa - Helios Prime',
              fuelExpiresMs: Date.UTC(2026, 9, 12, 5),
              state: 'shield_vulnerable',
              stateTimerEndMs: null,
              unanchorsAtMs: null,
              services: [],
            },
          ],
          structureCount: 1,
          needsReauth: false,
          fetchedAt,
        },
        error: false,
        loading: false,
      });
      store.set('moonChunks', {
        data: { chunks: [], extractions: [], needsReauth: false, fetchedAt, loadedAt: 0 },
        error: false,
        loading: false,
      });
      store.set('corpJobs', {
        data: {
          readable: true,
          needsReauth: false,
          fetchedAt,
          fromCache: false,
          jobs: [],
          typeNames: new Map(),
          installerNames: new Map(),
        },
        error: false,
        loading: false,
      } as never);
      const wrapper = ({ children }: { children: ReactNode }) => (
        <FeedStoreContext.Provider value={store}>{children}</FeedStoreContext.Provider>
      );
      const request: ViewRequest = { kind: 'corpDeadlines', scopeAll: false };
      const hook = renderHook(() => useKindViews([request]), { wrapper });
      const strip = () => {
        const chart = [...hook.result.current.values()][0]?.chart;
        if (chart?.kind !== 'bars') throw new Error('expected a bars chart');
        return chart.values.slice(0, 3);
      };

      expect(strip()).toEqual([1, 0, 0]);
      act(() => useTimeFormat.setState({ value: 'eve', hydrated: true }));
      expect(strip()).toEqual([0, 1, 0]);
    });
  });
});
