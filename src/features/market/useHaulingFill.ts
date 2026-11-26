import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planFill } from '@/engine/market/haulingFill';
import { fillCanFindMore } from '@/engine/market/haulingFillStop';
import {
  holdsCapacityM3,
  type TripCandidate,
  type TripOverride,
  type TripPlan,
} from '@/engine/market/haulingPlan';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketGroupNode } from '@/sde/marketTypes';
import { haulingCategoryOf } from './haulingCategories';
import type { HaulMode, HaulingScanRow } from './haulingData';
import { shownAddedM3, shownFreeM3, shownUsedM3 } from './format';
import type { HaulingEnd } from './haulingHubs';
import type { HaulingFillItem, HaulingFillListProps } from './HaulingTripRail';
import {
  filterHaulingRows,
  toViewRows,
  type HaulingFeesAt,
  type HaulingFilters,
  type HaulingViewRow,
} from './haulingView';
import { useHaulingFillScan, type HaulingFillMeasure } from './useHaulingFillScan';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const NO_IDS: ReadonlySet<number> = new Set();
const NO_ROWS: readonly HaulingScanRow[] = [];

type SizeFill = (
  extras: readonly HaulingViewRow[],
  batchIds: ReadonlySet<number>
) => HaulingFillMeasure;

export interface HaulingFillInput {
  from: HaulingEnd;
  to: HaulingEnd;
  mode: HaulMode;
  laneKey: string;
  feesAt: HaulingFeesAt;
  filters: HaulingFilters;
  groups: readonly MarketGroupNode[] | null;
  scannedTypeIds: readonly number[];
}

export function useHaulingFill({
  from,
  to,
  mode,
  laneKey,
  feesAt,
  filters,
  groups,
  scannedTypeIds,
}: HaulingFillInput) {
  const fillKey = `${laneKey}:max${filters.maxUnitPrice ?? ''}`;
  const [addedIds, setAddedIds] = useState<ReadonlySet<number>>(NO_IDS);
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(NO_IDS);
  const [lastAdded, setLastAdded] = useState<{ count: number; volumeM3: number } | null>(null);
  const [resetFor, setResetFor] = useState(fillKey);
  if (resetFor !== fillKey) {
    setResetFor(fillKey);
    setAddedIds(NO_IDS);
    setUnticked(NO_IDS);
    setLastAdded(null);
  }
  const addedRef = useRef(addedIds);
  useEffect(() => {
    addedRef.current = addedIds;
  }, [addedIds]);

  const viewOf = useCallback(
    (scanRows: readonly HaulingScanRow[]) =>
      filterHaulingRows(toViewRows(scanRows, feesAt), filters).shown,
    [feesAt, filters]
  );
  const sizeRef = useRef<SizeFill | null>(null);
  const bindSize = useCallback((size: SizeFill | null) => {
    sizeRef.current = size;
  }, []);

  const scan = useHaulingFillScan({
    from,
    to,
    mode,
    maxUnitPrice: filters.maxUnitPrice,
    laneKey: fillKey,
    excludeIds: () => [...scannedTypeIds, ...addedIds],
    measure: (scanRows, batchIds) => {
      const size = sizeRef.current;
      return size === null
        ? null
        : size(
            viewOf(scanRows).filter((r) => !addedIds.has(r.typeId)),
            batchIds
          );
    },
  });
  const { state } = scan;
  const scanned = state.status === 'idle' ? null : state.rows;
  const rows = useMemo(() => viewOf(scanned ?? NO_ROWS), [viewOf, scanned]);
  const addedRows = useMemo(
    () => (addedIds.size === 0 ? [] : rows.filter((r) => addedIds.has(r.typeId))),
    [rows, addedIds]
  );

  const loadCategoryOf = useCallback(
    () =>
      loadMarketTypes().then((types) =>
        haulingCategoryOf(
          (scanned ?? []).map((r) => r.typeId),
          groups ?? [],
          types
        )
      ),
    [scanned, groups]
  );
  const categoryOf =
    useKeyedLoad(
      'category',
      loadCategoryOf,
      scanned === null || scanned.length === 0 || groups === null
    ).data ?? null;

  const { find: findFresh, more: findMore, reset: resetScan } = scan;
  const find = () => {
    setUnticked(NO_IDS);
    setLastAdded(null);
    findFresh();
  };
  const more = () => {
    setLastAdded(null);
    findMore();
  };
  const toggle = (typeId: number, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  const markAdded = (typeIds: readonly number[], volumeM3: number) => {
    setAddedIds((current) => new Set([...current, ...typeIds]));
    setLastAdded({ count: typeIds.length, volumeM3 });
  };
  const reset = useCallback((): ReadonlySet<number> => {
    const dropped = addedRef.current;
    resetScan();
    setAddedIds(NO_IDS);
    setUnticked(NO_IDS);
    setLastAdded(null);
    return dropped;
  }, [resetScan]);

  return {
    state,
    requested: state.status !== 'idle' || addedIds.size > 0,
    rows,
    addedIds,
    addedRows,
    unticked,
    lastAdded,
    underMaxPrice: filters.maxUnitPrice !== null,
    categoryOf,
    bindSize,
    find,
    more,
    stop: scan.stop,
    toggle,
    markAdded,
    reset,
  };
}

export type HaulingFill = ReturnType<typeof useHaulingFill>;

export interface HaulingFillOfferInput {
  offered: boolean;
  current: readonly TripCandidate[];
  overrides: ReadonlyMap<number, TripOverride>;
  before: TripPlan;
  base: Pick<Parameters<typeof planFill>[0], 'holds' | 'budgetIsk' | 'fees'>;
  categoryName: (categoryId: number) => string;
  pin: (lines: readonly { typeId: number; quantity: number }[]) => void;
}

export function useHaulingFillOffer(
  fill: HaulingFill,
  { offered, current, overrides, before, base, categoryName, pin }: HaulingFillOfferInput
) {
  const { state } = fill;
  const settled = state.status === 'ready' || state.status === 'error';
  const extras = useMemo(
    () => (offered && settled ? fill.rows.filter((r) => !fill.addedIds.has(r.typeId)) : []),
    [offered, settled, fill.rows, fill.addedIds]
  );
  const planOf = useCallback(
    (rows: readonly HaulingViewRow[]) =>
      rows.length === 0
        ? null
        : planFill({ ...base, current, overrides, before, extras: rows.map((r) => r.candidate) }),
    [base, current, overrides, before]
  );

  const size = useCallback<SizeFill>(
    (rows, batchIds) => {
      const plan = planOf(rows);
      const after = plan?.after ?? before;
      return {
        freeM3: shownFreeM3(after.holds),
        capacityM3: holdsCapacityM3(after.holds),
        binding: after.binding,
        newLines: (plan?.lines ?? []).filter((l) => batchIds.has(l.typeId) && l.profit > 0).length,
        batchRows: rows.filter((r) => batchIds.has(r.typeId)).length,
      };
    },
    [planOf, before]
  );
  const { bindSize } = fill;
  useEffect(() => {
    bindSize(size);
  }, [bindSize, size]);

  const offer = useMemo(() => planOf(extras), [planOf, extras]);
  const offerLines = useMemo(() => offer?.lines ?? [], [offer]);
  const ticked = useMemo(() => {
    if (!offerLines.some((l) => fill.unticked.has(l.typeId))) return offer;
    const ids = new Set(offerLines.map((l) => l.typeId));
    return planOf(extras.filter((r) => ids.has(r.typeId) && !fill.unticked.has(r.typeId)));
  }, [planOf, offer, offerLines, extras, fill.unticked]);

  const tickedLineOf = new Map((ticked?.lines ?? []).map((l) => [l.typeId, l]));
  const items: HaulingFillItem[] = offerLines.map((offeredLine) => {
    const line = tickedLineOf.get(offeredLine.typeId) ?? offeredLine;
    const categoryId = fill.categoryOf?.get(line.typeId);
    return {
      typeId: line.typeId,
      name: line.name,
      categoryName: categoryId === undefined ? '' : categoryName(categoryId),
      quantity: line.quantity,
      volumeM3: line.volumeM3,
      cost: line.cost,
      profit: line.profit,
    };
  });

  const add = () => {
    if (ticked === null || ticked.lines.length === 0) return;
    const { lines } = ticked;
    fill.markAdded(
      lines.map((l) => l.typeId),
      shownAddedM3(before.holds, ticked.after.holds, ticked.added.volumeM3)
    );
    pin(lines);
  };

  const afterOffer = offer?.after ?? before;
  const freeAfterOffer = shownFreeM3(afterOffer.holds);
  const reason = state.status === 'ready' ? state.reason : null;
  const list: Omit<HaulingFillListProps, 'freeM3' | 'progressText'> = {
    status: state.status,
    batch: state.status === 'loading' ? state.batch : 0,
    runningFreeM3: state.status === 'loading' ? state.freeM3 : null,
    reason,
    underMaxPrice: fill.underMaxPrice,
    leftM3: freeAfterOffer,
    canFindMore:
      reason !== null &&
      fillCanFindMore({
        reason,
        freeM3: freeAfterOffer,
        capacityM3: holdsCapacityM3(before.holds),
        binding: afterOffer.binding,
      }),
    added: fill.lastAdded,
    items,
    ticked: new Set(offerLines.filter((l) => !fill.unticked.has(l.typeId)).map((l) => l.typeId)),
    onToggle: fill.toggle,
    onFind: fill.find,
    onMore: fill.more,
    onStop: fill.stop,
    onAdd: add,
    tickedTotals: {
      count: ticked?.lines.length ?? 0,
      volumeM3: ticked ? shownAddedM3(before.holds, ticked.after.holds, ticked.added.volumeM3) : 0,
      cost: ticked?.added.cost ?? 0,
      profit: ticked?.added.profit ?? 0,
    },
    holdAfter: ticked
      ? {
          usedM3: shownUsedM3(ticked.after.holds),
          capacityM3: holdsCapacityM3(ticked.after.holds),
          freeM3: shownFreeM3(ticked.after.holds),
        }
      : null,
  };
  return { list, cargoValueAfterFill: ticked ? ticked.after.totals.cost : null };
}
