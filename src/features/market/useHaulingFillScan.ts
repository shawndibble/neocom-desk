import { idSetKey } from '@/lib/idSetKey';
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
import type { HaulingEnd } from './haulingHubs';
import { scanHaulingLane } from './haulingScanRun';

export type HaulingFillMeasure = Pick<
  FillBatchOutcome,
  'freeM3' | 'capacityM3' | 'binding' | 'newLines' | 'batchRows'
>;

export type HaulingFillScanState =
  | { status: 'idle' }
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
      reason: HaulingFillStopReason;
      batches: number;
    }
  | { status: 'error'; rows: readonly HaulingScanRow[]; batches: number };

export interface HaulingFillScanInput {
  from: HaulingEnd;
  to: HaulingEnd;
  mode: HaulMode;
  maxUnitPrice: number | null;
  laneKey: string;
  excludeIds: () => Iterable<number>;
  measure: (
    rows: readonly HaulingScanRow[],
    batchIds: ReadonlySet<number>
  ) => HaulingFillMeasure | null;
}

export function haulingFillScope(skipped: Iterable<number>): string {
  return `fill:${idSetKey(skipped)}`;
}

interface Run {
  laneKey: string;
  fresh: boolean;
}

interface Found {
  laneKey: string;
  rows: HaulingScanRow[];
  examined: Set<number>;
  batches: number;
  freeM3: number | null;
  cacheKeys: Set<string>;
}

export function useHaulingFillScan(input: HaulingFillScanInput) {
  const { from, to, mode, maxUnitPrice, laneKey } = input;
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
        examined: new Set(),
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

    let everyId: number[] | null = null;
    void (async () => {
      for (let batchInPress = 1; ; batchInPress += 1) {
        const batchNumber = lane.batches + 1;
        const loading = (progress: HaulingProgress | null) =>
          show({
            status: 'loading',
            batch: batchNumber,
            progress,
            rows: lane.rows,
            freeM3: lane.freeM3,
          });
        loading(null);
        const skip = new Set([...latest.current.excludeIds(), ...lane.examined]);
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
              maxUnitPrice,
              typeIds: (groups, marketTypes) => {
                everyId ??= typeIdsInHaulingCategory(EVERYTHING_CATEGORY_ID, groups, marketTypes);
                return everyId.filter((id) => !skip.has(id));
              },
            },
            signal,
            loading
          );
        } catch {
          show({ status: 'error', rows: lane.rows, batches: lane.batches });
          return;
        }
        if (signal.aborted) return;
        lane.cacheKeys.add(haulingScanCacheKey({ from, to, scope, mode, maxUnitPrice }));
        lane.rows = [...lane.rows, ...scan.rows];
        for (const id of scan.examinedTypeIds) lane.examined.add(id);
        lane.batches = batchNumber;
        let measured: HaulingFillMeasure | null;
        try {
          measured = latest.current.measure(lane.rows, new Set(scan.rows.map((r) => r.typeId)));
        } catch {
          show({ status: 'error', rows: lane.rows, batches: lane.batches });
          return;
        }
        if (measured !== null) lane.freeM3 = measured.freeM3;
        const reason = haulingFillStop({
          ...(measured ?? {
            freeM3: Number.POSITIVE_INFINITY,
            capacityM3: 0,
            binding: null,
            newLines: scan.rows.length,
            batchRows: scan.rows.length,
          }),
          batchInPress,
          capped: scan.capped ?? false,
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
  }, [active, from, to, mode, maxUnitPrice]);

  const find = useCallback(() => setRun({ laneKey, fresh: true }), [laneKey]);
  const more = useCallback(() => setRun({ laneKey, fresh: false }), [laneKey]);
  const stop = useCallback(() => {
    stopRun.current?.();
  }, []);
  const reset = useCallback(() => {
    for (const key of found.current?.cacheKeys ?? []) evictHaulingScan(key);
    found.current = null;
    setRun(null);
  }, []);

  let state: HaulingFillScanState = { status: 'idle' };
  if (active !== null) {
    if (view?.run === active) state = view.state;
    else {
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
