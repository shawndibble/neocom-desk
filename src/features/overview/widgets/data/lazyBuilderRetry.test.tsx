import { useState, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { blank } from './builderKit';
import { OverviewRefreshContext } from './refreshContext';
import { WidgetDataProvider } from './WidgetDataProvider';
import { useKindViews } from './useWidgetView';
import { buildView, ensureBuilders, registerKindDefs } from './models';
import type { Builder } from './builderKit';

const CTX = {
  t: (k: string) => k,
  now: 0,
  activeCharacterId: null,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30 as const,
};

const status = (loading: boolean) => ({
  loading,
  needsPermission: false,
  error: false,
  hasData: !loading,
  isEmpty: false,
});
const pending: Builder = () => blank(null, status(true));
const real: Builder = () => ({ ...blank(null, status(false)), summary: 'real' });

/** A lazy kind whose first `failures` loads reject. */
function probe(kind: string, failures: number) {
  let calls = 0;
  registerKindDefs({
    [kind]: {
      feeds: [],
      scope: 'character',
      build: pending,
      loadBuild: () => {
        calls += 1;
        return calls <= failures ? Promise.reject(new Error('chunk 404')) : Promise.resolve(real);
      },
    },
  });
  return () => calls;
}

describe('lazy builder load failure', () => {
  it('forgets a rejected load, shows failed meanwhile, and a retry lands the builder', async () => {
    const calls = probe('retryProbeA', 1);
    expect(buildView('retryProbeA', {}, CTX).status.loading).toBe(true);
    await expect(ensureBuilders(['retryProbeA'])).rejects.toThrow('chunk 404');
    const failed = buildView('retryProbeA', {}, CTX).status;
    expect(failed.error).toBe(true);
    expect(failed.loading).toBe(false);
    await ensureBuilders(['retryProbeA']);
    expect(calls()).toBe(2);
    const landed = buildView('retryProbeA', {}, CTX);
    expect(landed.status.error).toBe(false);
    expect(landed.summary).toBe('real');
  });

  it('retries on the refresh epoch and the view rebuilds', async () => {
    const calls = probe('retryProbeB', 1);
    let bump = () => undefined as void;
    function Wrapper({ children }: { children: ReactNode }) {
      const [epoch, setEpoch] = useState(0);
      bump = () => setEpoch((n) => n + 1);
      return (
        <OverviewRefreshContext.Provider value={{ epoch, refresh: bump }}>
          <WidgetDataProvider kinds={['retryProbeB']}>{children}</WidgetDataProvider>
        </OverviewRefreshContext.Provider>
      );
    }
    const hook = renderHook(() => useKindViews([{ kind: 'retryProbeB', scopeAll: false }]), {
      wrapper: Wrapper,
    });
    const view = () => [...hook.result.current.values()][0]!;
    await act(async () => {});
    expect(calls()).toBe(1);
    expect(view().status.error).toBe(true);
    expect(view().status.loading).toBe(false);
    await act(async () => bump());
    expect(calls()).toBe(2);
    expect(view().status.error).toBe(false);
    expect(view().summary).toBe('real');
  });
});
