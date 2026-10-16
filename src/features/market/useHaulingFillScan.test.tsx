import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import type { HaulingScan, HaulingScanRequest } from './haulingData';
import type { HaulingEnd } from './haulingHubs';

const groups = [
  { id: 11, name: 'Ammunition & Charges', parentId: null, hasTypes: true },
  { id: 9, name: 'Ship Equipment', parentId: null, hasTypes: true },
  { id: 157, name: 'Drones', parentId: null, hasTypes: true },
];
const marketTypes = [
  { typeId: 1, name: 'Ammo', marketGroupId: 11, volume: 0.01 },
  { typeId: 2, name: 'Module', marketGroupId: 9, volume: 5 },
  { typeId: 3, name: 'Drone', marketGroupId: 157, volume: 10 },
];
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => groups),
  loadMarketTypes: vi.fn(async () => marketTypes),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({})),
  loadGroupCategories: vi.fn(async () => ({})),
}));

const SCAN: HaulingScan = { rows: [], scanned: 2, fetchedAt: 0 };
const runHaulingScan = vi.fn<(request: HaulingScanRequest) => Promise<HaulingScan>>(
  async () => SCAN
);
const clearHaulingScanCache = vi.fn();
vi.mock('./haulingData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./haulingData')>()),
  runHaulingScan: (request: HaulingScanRequest) => runHaulingScan(request),
  clearHaulingScanCache: () => clearHaulingScanCache(),
}));

const { haulingScanCacheKey } = await import('./haulingData');
const { useHaulingFillScan, haulingFillScope } = await import('./useHaulingFillScan');

const JITA = TRADE_HUBS[0]!;
const AMARR = TRADE_HUBS[1]!;
const AMMO = 11;

interface Props {
  from: HaulingEnd;
  to: HaulingEnd;
  categoryId: number;
  enabled: boolean;
}

function renderFill(initial: Partial<Props> = {}) {
  return renderHook(
    (p: Props) => useHaulingFillScan(p.from, p.to, p.categoryId, 'list', p.enabled),
    { initialProps: { from: JITA, to: AMARR, categoryId: AMMO, enabled: false, ...initial } }
  );
}

beforeEach(() => {
  runHaulingScan.mockReset();
  runHaulingScan.mockImplementation(async () => SCAN);
  clearHaulingScanCache.mockClear();
});

describe('useHaulingFillScan', () => {
  it('stays idle and scans nothing until the user asks', () => {
    const { result } = renderFill();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).not.toHaveBeenCalled();
  });

  it('scans every other category on the lane once asked, under its own cache scope', async () => {
    const { result, rerender } = renderFill();
    rerender({ from: JITA, to: AMARR, categoryId: AMMO, enabled: true });
    expect(result.current.state).toEqual({ status: 'loading', progress: null });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', scan: SCAN }));

    const request = runHaulingScan.mock.calls[0]![0];
    expect(request).toMatchObject({ from: JITA, to: AMARR, mode: 'list', typeIds: [2, 3] });
    expect(request.scope).toBe(haulingFillScope(AMMO));
    expect(haulingScanCacheKey(request)).not.toBe(haulingScanCacheKey({ ...request, scope: AMMO }));
  });

  it('never scans for Everything', () => {
    const { result } = renderFill({ categoryId: 0, enabled: true });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).not.toHaveBeenCalled();
  });

  it('abandons the scan and goes idle when the route changes, until asked again', async () => {
    let finish: (scan: HaulingScan) => void = () => {};
    let signal: AbortSignal | undefined;
    runHaulingScan.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          signal = request.signal;
          finish = resolve;
        })
    );
    const { result, rerender } = renderFill({ enabled: true });
    await waitFor(() => expect(runHaulingScan).toHaveBeenCalledTimes(1));

    const other = TRADE_HUBS[2]!;
    rerender({ from: JITA, to: other, categoryId: AMMO, enabled: true });
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: 'idle' });
    await act(async () => finish(SCAN));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).toHaveBeenCalledTimes(1);

    // Asked again: off, then on.
    rerender({ from: JITA, to: other, categoryId: AMMO, enabled: false });
    rerender({ from: JITA, to: other, categoryId: AMMO, enabled: true });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));
    expect(runHaulingScan.mock.calls[1]![0]).toMatchObject({ to: other });
  });

  it('stays idle on coming back to the lane it was asked for', async () => {
    const { result, rerender } = renderFill({ enabled: true });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));
    rerender({ from: JITA, to: TRADE_HUBS[2]!, categoryId: AMMO, enabled: true });
    rerender({ from: JITA, to: AMARR, categoryId: AMMO, enabled: true });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).toHaveBeenCalledTimes(1);
  });

  it('goes idle on a category or mode change too', async () => {
    const { result, rerender } = renderFill({ enabled: true });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));
    rerender({ from: JITA, to: AMARR, categoryId: 9, enabled: true });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('asks again for the new lane on refresh, and re-scans the same lane afresh', async () => {
    const { result, rerender } = renderFill({ enabled: true });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));

    act(() => result.current.refresh());
    expect(clearHaulingScanCache).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(runHaulingScan).toHaveBeenCalledTimes(2));

    rerender({ from: JITA, to: TRADE_HUBS[2]!, categoryId: AMMO, enabled: true });
    expect(result.current.state).toEqual({ status: 'idle' });
    act(() => result.current.refresh());
    expect(clearHaulingScanCache).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));
    expect(runHaulingScan).toHaveBeenCalledTimes(3);
  });

  it('reports a failed scan, a storage failure included', async () => {
    runHaulingScan.mockRejectedValueOnce(new Error('ESI down'));
    const { result } = renderFill({ enabled: true });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));

    runHaulingScan.mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
    const quota = renderFill({ enabled: true });
    await waitFor(() => expect(quota.result.current.state).toEqual({ status: 'error' }));
  });

  it('does nothing on refresh before the user asks', () => {
    const { result } = renderFill();
    act(() => result.current.refresh());
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).not.toHaveBeenCalled();
  });
});
