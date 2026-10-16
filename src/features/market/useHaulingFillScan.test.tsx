import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FILL_BATCH_CAP } from '@/engine/market/haulingFillStop';
import { TRADE_HUBS } from '@/market/hubs';
import type { HaulingScan, HaulingScanRequest, HaulingScanRow } from './haulingData';
import { haulingEndId, type HaulingEnd } from './haulingHubs';
import type { HaulingFillMeasure } from './useHaulingFillScan';

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

const row = (typeId: number) => ({ typeId, name: `#${typeId}` }) as HaulingScanRow;
const scanOf = (
  rows: HaulingScanRow[],
  capped = true,
  examinedTypeIds = rows.map((r) => r.typeId)
): HaulingScan => ({
  rows,
  scanned: rows.length,
  ...(capped ? { capped } : {}),
  examinedTypeIds,
  overMaxPrice: 0,
  fetchedAt: 0,
});

/** Each batch returns one new row, #101, #102…, and says more is left. */
let next = 100;
const runHaulingScan = vi.fn<(request: HaulingScanRequest) => Promise<HaulingScan>>();
const clearHaulingScanCache = vi.fn();
const evictHaulingScan = vi.fn<(key: string) => void>();
vi.mock('./haulingData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./haulingData')>()),
  runHaulingScan: (request: HaulingScanRequest) => runHaulingScan(request),
  clearHaulingScanCache: () => clearHaulingScanCache(),
  evictHaulingScan: (key: string) => evictHaulingScan(key),
}));

const { haulingScanCacheKey } = await import('./haulingData');
const { useHaulingFillScan, haulingFillScope } = await import('./useHaulingFillScan');

const JITA = TRADE_HUBS[0]!;
const AMARR = TRADE_HUBS[1]!;
const AMMO = 11;

/** `batchRows` defaults to every id the batch brought: none filtered out. */
type Measured = Omit<HaulingFillMeasure, 'batchRows'> & { batchRows?: number };
/** Room left after every batch until told otherwise; each batch adds a line. */
const ROOMY: Measured = {
  freeM3: 30_000,
  capacityM3: 60_000,
  newLines: 1,
  binding: 'space',
};
const measure =
  vi.fn<(rows: readonly HaulingScanRow[], batchIds: ReadonlySet<number>) => Measured | null>();
let maxUnitPrice: number | null = null;
let tableIds: number[] = [];

interface Props {
  from: HaulingEnd;
  to: HaulingEnd;
  categoryId: number;
}

function renderFill(initial: Partial<Props> = {}) {
  return renderHook(
    (p: Props) =>
      useHaulingFillScan({
        from: p.from,
        to: p.to,
        mode: 'list',
        maxUnitPrice,
        laneKey: `${haulingEndId(p.from)}>${haulingEndId(p.to)}:${p.categoryId}:${maxUnitPrice}`,
        excludeIds: () => tableIds,
        measure: (rows, ids) => {
          const measured = measure(rows, ids);
          return measured === null ? null : { batchRows: ids.size, ...measured };
        },
      }),
    { initialProps: { from: JITA, to: AMARR, categoryId: AMMO, ...initial } }
  );
}

const ready = (result: { current: ReturnType<typeof useHaulingFillScan> }) =>
  waitFor(() => expect(result.current.state.status).toBe('ready'));

beforeEach(() => {
  next = 100;
  tableIds = [];
  maxUnitPrice = null;
  runHaulingScan.mockReset();
  runHaulingScan.mockImplementation(async () => scanOf([row((next += 1))]));
  measure.mockReset();
  measure.mockReturnValue(ROOMY);
  clearHaulingScanCache.mockClear();
  evictHaulingScan.mockClear();
});

describe('haulingFillScope', () => {
  it('never shares a cache key with a category scan, Everything included', () => {
    for (const category of [0, AMMO]) {
      expect(haulingScanCacheKey({ from: JITA, to: AMARR, scope: haulingFillScope([]) })).not.toBe(
        haulingScanCacheKey({ from: JITA, to: AMARR, scope: category })
      );
    }
  });

  it('names the ids left out exactly, in any order', () => {
    expect(haulingFillScope([3, 1, 3])).toBe(haulingFillScope([1, 3]));
    expect(haulingFillScope([1, 3])).not.toBe(haulingFillScope([1]));
    expect(haulingFillScope([12])).not.toBe(haulingFillScope([1, 2]));
  });
});

describe('useHaulingFillScan', () => {
  it('stays idle and scans nothing until the user asks', () => {
    const { result } = renderFill();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).not.toHaveBeenCalled();
  });

  it('runs batch after batch over every category less the table and earlier batches, until full', async () => {
    tableIds = [2];
    measure
      .mockReturnValueOnce(ROOMY)
      .mockReturnValueOnce(ROOMY)
      .mockReturnValueOnce({ ...ROOMY, freeM3: 120 });
    // The first batch returns #1, a type the next must not scan again.
    runHaulingScan.mockImplementationOnce(async () => scanOf([row(1)]));
    const { result } = renderFill();
    act(() => result.current.find());
    expect(result.current.state).toMatchObject({ status: 'loading', batch: 1 });
    await ready(result);

    expect(result.current.state).toEqual({
      status: 'ready',
      rows: [row(1), row(101), row(102)],
      reason: 'full',
      batches: 3,
    });
    const calls = runHaulingScan.mock.calls.map(([request]) => request);
    expect(calls.map((r) => r.typeIds)).toEqual([[1, 3], [3], [3]]);
    // Its own scope per id set, never a category's.
    expect(calls[0]!.scope).toBe(haulingFillScope([2]));
    expect(calls[1]!.scope).toBe(haulingFillScope([1, 2]));
    expect(calls[2]!.scope).toBe(haulingFillScope([1, 2, 101]));
    // Sized on everything found, told which ids the batch brought.
    expect(measure.mock.calls[1]).toEqual([[row(1), row(101)], new Set([101])]);
  });

  it('never scans again what an earlier batch examined, a row or not', async () => {
    measure.mockReturnValueOnce(ROOMY).mockReturnValueOnce({ ...ROOMY, freeM3: 0 });
    // #1 became a row; #2 was looked at and dropped.
    runHaulingScan.mockImplementationOnce(async () => scanOf([row(1)], true, [1, 2]));
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    const second = runHaulingScan.mock.calls[1]![0];
    expect(second.typeIds).toEqual([3]);
    // Still an exact scope of its own.
    expect(second.scope).toBe(haulingFillScope([1, 2]));
    expect(second.scope).not.toBe(runHaulingScan.mock.calls[0]![0].scope);
  });

  it('carries on after an empty batch that was cut short, past what it examined', async () => {
    runHaulingScan.mockImplementationOnce(async () => scanOf([], true, [1, 2]));
    measure
      .mockReturnValueOnce({ ...ROOMY, newLines: 0 })
      .mockReturnValueOnce({ ...ROOMY, freeM3: 0 });
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    expect(runHaulingScan).toHaveBeenCalledTimes(2);
    expect(runHaulingScan.mock.calls[1]![0].typeIds).toEqual([3]);
    expect(result.current.state).toMatchObject({ reason: 'full', batches: 2 });
  });

  it('judges a batch by the rows that pass the filters: all filtered out and not capped is nothing left', async () => {
    runHaulingScan.mockImplementation(async () => scanOf([row(1)], false));
    measure.mockReturnValue({ ...ROOMY, newLines: 0, batchRows: 0 });
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    expect(result.current.state).toMatchObject({ reason: 'nothing-left' });
  });

  it('never stops for want of a sizer: the scan alone is judged', async () => {
    measure.mockReturnValue(null);
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    expect(result.current.state).toMatchObject({ reason: 'batch-cap', batches: FILL_BATCH_CAP });
  });

  it('gives every batch the Max price, and keys its cache entry by it', async () => {
    maxUnitPrice = 500;
    measure.mockReturnValue({ ...ROOMY, freeM3: 0 });
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    const request = runHaulingScan.mock.calls[0]![0];
    expect(request.maxUnitPrice).toBe(500);
    act(() => result.current.reset());
    expect(evictHaulingScan).toHaveBeenCalledWith(haulingScanCacheKey(request));
    expect(haulingScanCacheKey(request)).toContain(':max500');
  });

  it('goes idle when the Max price changes, like a new lane', async () => {
    measure.mockReturnValue({ ...ROOMY, freeM3: 0 });
    const { result, rerender } = renderFill();
    act(() => result.current.find());
    await ready(result);
    maxUnitPrice = 500;
    rerender({ from: JITA, to: AMARR, categoryId: AMMO });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('works for Everything too', async () => {
    const { result } = renderFill({ categoryId: 0 });
    act(() => result.current.find());
    measure.mockReturnValue({ ...ROOMY, freeM3: 0 });
    await ready(result);
    expect(runHaulingScan.mock.calls[0]![0].typeIds).toEqual([1, 2, 3]);
  });

  it.each([
    ['nothing-left', () => runHaulingScan.mockImplementation(async () => scanOf([], false))],
    ['no-gain', () => measure.mockReturnValue({ ...ROOMY, newLines: 0 })],
    ['budget', () => measure.mockReturnValue({ ...ROOMY, binding: 'budget' })],
  ] as const)('stops with %s', async (reason, arrange) => {
    arrange();
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    expect(result.current.state).toMatchObject({ reason, batches: 1 });
    expect(runHaulingScan).toHaveBeenCalledTimes(1);
  });

  it('stops at the batch cap, and Find more carries on from there', async () => {
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    expect(result.current.state).toMatchObject({ reason: 'batch-cap', batches: FILL_BATCH_CAP });
    expect(runHaulingScan).toHaveBeenCalledTimes(FILL_BATCH_CAP);

    measure.mockReturnValueOnce(ROOMY).mockReturnValueOnce({ ...ROOMY, freeM3: 0 });
    act(() => result.current.more());
    expect(result.current.state).toMatchObject({ status: 'loading', batch: FILL_BATCH_CAP + 1 });
    await ready(result);
    expect(result.current.state).toMatchObject({ reason: 'full', batches: FILL_BATCH_CAP + 2 });
    if (result.current.state.status !== 'ready') throw new Error('not ready');
    expect(result.current.state.rows).toHaveLength(FILL_BATCH_CAP + 2);
  });

  it('Stop drops the batch in flight and keeps what earlier batches found', async () => {
    let signal: AbortSignal | undefined;
    runHaulingScan
      .mockImplementationOnce(async () => scanOf([row(1)]))
      .mockImplementationOnce((request) => {
        signal = request.signal;
        return new Promise(() => {});
      });
    const { result } = renderFill();
    act(() => result.current.find());
    await waitFor(() => expect(result.current.state).toMatchObject({ batch: 2 }));
    expect(result.current.state).toMatchObject({ freeM3: ROOMY.freeM3, rows: [row(1)] });

    act(() => result.current.stop());
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({
      status: 'ready',
      rows: [row(1)],
      reason: 'stopped',
      batches: 1,
    });
    expect(runHaulingScan).toHaveBeenCalledTimes(2);
  });

  it('abandons the batches and goes idle when the route changes, until asked again', async () => {
    let finish: (scan: HaulingScan) => void = () => {};
    let signal: AbortSignal | undefined;
    runHaulingScan.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          signal = request.signal;
          finish = resolve;
        })
    );
    const { result, rerender } = renderFill();
    act(() => result.current.find());
    await waitFor(() => expect(runHaulingScan).toHaveBeenCalledTimes(1));

    const other = TRADE_HUBS[2]!;
    rerender({ from: JITA, to: other, categoryId: AMMO });
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: 'idle' });
    await act(async () => finish(scanOf([row(1)])));
    expect(result.current.state).toEqual({ status: 'idle' });

    // Coming back to the lane stays idle: it never re-runs by itself.
    rerender({ from: JITA, to: AMARR, categoryId: AMMO });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(runHaulingScan).toHaveBeenCalledTimes(1);
  });

  it('goes idle on a category change too', async () => {
    measure.mockReturnValue({ ...ROOMY, freeM3: 0 });
    const { result, rerender } = renderFill();
    act(() => result.current.find());
    await ready(result);
    rerender({ from: JITA, to: AMARR, categoryId: 9 });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('reports a failed batch, and Try again carries on', async () => {
    runHaulingScan
      .mockImplementationOnce(async () => scanOf([row(1)]))
      .mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
    const { result } = renderFill();
    act(() => result.current.find());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state).toEqual({ status: 'error', rows: [row(1)], batches: 1 });

    measure.mockReturnValue({ ...ROOMY, freeM3: 0 });
    act(() => result.current.more());
    await ready(result);
    expect(result.current.state).toMatchObject({ rows: [row(1), row(101)], batches: 2 });
  });

  it('reports a sizing failure as a failed batch, not a run that never ends', async () => {
    measure.mockImplementation(() => {
      throw new Error('plan failed');
    });
    const { result } = renderFill();
    act(() => result.current.find());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });

  it('reset evicts only the fill’s own cache entries and goes idle', async () => {
    measure.mockReturnValueOnce(ROOMY).mockReturnValueOnce({ ...ROOMY, freeM3: 0 });
    runHaulingScan.mockImplementationOnce(async () => scanOf([row(1)]));
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    const keys = runHaulingScan.mock.calls.map(([request]) => haulingScanCacheKey(request));

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(keys).toHaveLength(2);
    expect(evictHaulingScan.mock.calls.map(([key]) => key)).toEqual(keys);
    expect(keys.every((key) => key.includes(':fill:'))).toBe(true);
    expect(clearHaulingScanCache).not.toHaveBeenCalled();
  });

  it('Find starts afresh: nothing found before is kept', async () => {
    measure.mockReturnValue({ ...ROOMY, freeM3: 0 });
    const { result } = renderFill();
    act(() => result.current.find());
    await ready(result);
    act(() => result.current.find());
    await waitFor(() => expect(runHaulingScan).toHaveBeenCalledTimes(2));
    await ready(result);
    expect(result.current.state).toMatchObject({ rows: [row(102)], batches: 1 });
    expect(runHaulingScan.mock.calls[1]![0].typeIds).toEqual([1, 2, 3]);
  });
});
