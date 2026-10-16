/**
 * The on-demand scan behind "Fill the free space": batch after batch of the
 * same Hauling Opportunities scan as `useHaulingScan`, over every Hauling
 * category's type ids less those the table already holds and those earlier
 * batches returned, until `haulingFillStop` says stop (or the user does).
 *
 * Runs only when asked (`find`, `more`), never by itself: each batch costs a
 * scan's ESI budget. Batches run one after another, never side by side. A
 * route/category/mode change aborts → idle, dropping what was found.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  haulingFillStop,
  type FillBatchOutcome,
  type HaulingFillStopReason,
} from '@/engine/market/haulingFillStop';
import { EVERYTHING_CATEGORY_ID, typeIdsInHaulingCategory } from './haulingCategories';
import {
  evictHaulingScan,
  haulingScanCacheKey,
  type HaulMode,
  type HaulingProgress,
  type HaulingScan,
  type HaulingScanRow,
} from './haulingData';
import { haulingEndId, type HaulingEnd } from './haulingHubs';
import { scanHaulingLane } from './haulingScanRun';

/** What sizing everything found so far into the hold gives: `FillBatchOutcome`'s plan half. */
export type HaulingFillMeasure = Pick<
  FillBatchOutcome,
  'freeM3' | 'capacityM3' | 'newLines' | 'binding'
>;

export type HaulingFillScanState =
  | { status: 'idle' }
  /** `batch` counts every batch since Find, Find more's included; `freeM3` is null before the first one lands. */
  | {
      status: 'loading';
      batch: number;
      progress: HaulingProgress | null;
      rows: readonly HaulingScanRow[];
      freeM3: number | null;
    }
  | {
      status: 'ready';
      rows: readonly HaulingScanRow[];
      reason: Exclude<HaulingFillStopReason, 'error'>;
      batches: number;
    }
  | { status: 'error'; rows: readonly HaulingScanRow[]; batches: number };

export interface HaulingFillScanInput {
  from: HaulingEnd;
  to: HaulingEnd;
  categoryId: number;
  mode: HaulMode;
  /** Type ids already in the table (scanned and added): never scanned again. Read before each batch. */
  excludeIds: () => Iterable<number>;
  /** Sizes every row found so far; `batchIds` are the last batch's. Null when nothing can be sized (stop). */
  measure: (
    rows: readonly HaulingScanRow[],
    batchIds: ReadonlySet<number>
  ) => HaulingFillMeasure | null;
}

/**
 * A batch's cache scope: the ids it leaves out of every Hauling category,
 * which name its id set exactly, so two batches never share an entry. A
 * string, so it never collides with a category's numeric scope.
 */
export function haulingFillScope(skipped: Iterable<number>): string {
  return `fill:${[...new Set(skipped)].sort((a, b) => a - b).join(',')}`;
}

/** One press: Find starts afresh; Find more and Try again carry on. */
interface Run {
  laneKey: string;
  fresh: boolean;
}

/** What a lane's fill has found across presses. */
interface Found {
  laneKey: string;
  rows: HaulingScanRow[];
  batches: number;
  freeM3: number | null;
  /** Every cache key a batch filled, so a reset drops exactly those. */
  cacheKeys: Set<string>;
}

export function useHaulingFillScan(input: HaulingFillScanInput) {
  const { from, to, categoryId, mode } = input;
  const laneKey = `${haulingEndId(from)}>${haulingEndId(to)}:${categoryId}:${mode}`;
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  const [run, setRun] = useState<Run | null>(null);
  const [seenLane, setSeenLane] = useState(laneKey);
  if (seenLane !== laneKey) {
    setSeenLane(laneKey);
    setRun(null);
  }
  // Tagged with the press it answers, so an old lane's rows never show for a new one.
  const [view, setView] = useState<{ run: Run; state: HaulingFillScanState } | null>(null);
  const found = useRef<Found | null>(null);
  const stopRun = useRef<(() => void) | null>(null);

  const active = run?.laneKey === laneKey ? run : null;

  useEffect(() => {
    if (active === null) return;
    const press = active;
    const controller = new AbortController();
    const { signal } = controller;
    if (press.fresh || found.current?.laneKey !== press.laneKey) {
      found.current = {
        laneKey: press.laneKey,
        rows: [],
        batches: 0,
        freeM3: null,
        cacheKeys: new Set(),
      };
    }
    const lane = found.current;
    const show = (state: HaulingFillScanState) => {
      if (signal.aborted) return;
      if (state.status !== 'loading') stopRun.current = null;
      setView({ run: press, state });
    };
    stopRun.current = () => {
      controller.abort();
      stopRun.current = null;
      setView({
        run: press,
        state: { status: 'ready', rows: lane.rows, reason: 'stopped', batches: lane.batches },
      });
    };

    void (async () => {
      for (let thisRun = 1; ; thisRun += 1) {
        const batch = lane.batches + 1;
        const loading = (progress: HaulingProgress | null) =>
          show({ status: 'loading', batch, progress, rows: lane.rows, freeM3: lane.freeM3 });
        loading(null);
        const skip = new Set(latest.current.excludeIds());
        for (const row of lane.rows) skip.add(row.typeId);
        const scope = haulingFillScope(skip);
        let scan: HaulingScan;
        try {
          scan = await scanHaulingLane(
            {
              from,
              to,
              mode,
              scope,
              typeIds: (groups, marketTypes) =>
                typeIdsInHaulingCategory(EVERYTHING_CATEGORY_ID, groups, marketTypes).filter(
                  (id) => !skip.has(id)
                ),
            },
            signal,
            loading
          );
        } catch {
          // An abort lands nowhere (`show` checks); any other failure, IndexedDB's included, is an error.
          show({ status: 'error', rows: lane.rows, batches: lane.batches });
          return;
        }
        // A cached batch answers at once, without looking at the signal.
        if (signal.aborted) return;
        lane.cacheKeys.add(haulingScanCacheKey({ from, to, scope, mode }));
        const kept = scan.rows.filter((row) => !skip.has(row.typeId));
        lane.rows = [...lane.rows, ...kept];
        lane.batches = batch;
        let measured: HaulingFillMeasure | null;
        try {
          measured = latest.current.measure(lane.rows, new Set(kept.map((r) => r.typeId)));
        } catch {
          show({ status: 'error', rows: lane.rows, batches: lane.batches });
          return;
        }
        if (measured !== null) lane.freeM3 = measured.freeM3;
        const reason =
          measured === null
            ? 'stopped'
            : haulingFillStop({
                ...measured,
                batchesThisRun: thisRun,
                batchRows: kept.length,
                // Only returned rows are left out of the next batch, so after an
                // empty one it would be the same scan: nothing more is reachable.
                capped: kept.length > 0 && (scan.capped ?? false),
              });
        if (reason !== null) {
          show({ status: 'ready', rows: lane.rows, reason, batches: lane.batches });
          return;
        }
      }
    })();
    return () => {
      controller.abort();
      stopRun.current = null;
    };
  }, [active, from, to, mode]);

  const find = useCallback(() => setRun({ laneKey, fresh: true }), [laneKey]);
  /** Find more, and Try again after a failed batch: carries on from what was found. */
  const more = useCallback(() => setRun({ laneKey, fresh: false }), [laneKey]);
  /** Ends the run after the batch in flight is dropped, keeping what earlier batches found. */
  const stop = useCallback(() => {
    stopRun.current?.();
  }, []);
  /** Back to idle, dropping what was found and only the fill's own cache entries. */
  const reset = useCallback(() => {
    for (const key of found.current?.cacheKeys ?? []) evictHaulingScan(key);
    found.current = null;
    setRun(null);
  }, []);

  let state: HaulingFillScanState = { status: 'idle' };
  if (active !== null) {
    if (view?.run === active) state = view.state;
    else {
      // The frame before the run's first update: Find more carries on from the last press.
      const last =
        !active.fresh && view?.run.laneKey === laneKey && view.state.status !== 'idle'
          ? view.state
          : null;
      state = {
        status: 'loading',
        batch: (last !== null && last.status !== 'loading' ? last.batches : 0) + 1,
        progress: null,
        rows: last?.rows ?? [],
        freeM3: null,
      };
    }
  }
  return { state, find, more, stop, reset };
}
