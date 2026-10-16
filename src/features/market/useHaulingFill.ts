/**
 * Hauling's "Fill the free space": the on-demand batches, the rows added from
 * them, and the offer sized into the room the plan leaves. Two hooks: the
 * offer needs the plan, and the plan needs the added rows.
 */
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

const NO_IDS: ReadonlySet<number> = new Set();
const NO_ROWS: readonly HaulingScanRow[] = [];

/** Sizes fill rows (already filtered, added ones out) against the plan; `batchIds` are the last batch's. */
type SizeFill = (
  extras: readonly HaulingViewRow[],
  batchIds: ReadonlySet<number>
) => HaulingFillMeasure;

export interface HaulingFillInput {
  from: HaulingEnd;
  to: HaulingEnd;
  mode: HaulMode;
  /** The route, category and mode as one key: a new one drops the fill and its added rows. */
  laneKey: string;
  feesAt: HaulingFeesAt;
  /** The panel's own row filters: the fill shows and sizes only what the table would. */
  filters: HaulingFilters;
  groups: readonly MarketGroupNode[] | null;
  /** Every type id the category scan returned or examined: the fill never scans them again. */
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
  // Max price changes what each batch's price pass keeps, so the fill starts over as on a new lane.
  const fillKey = `${laneKey}:max${filters.maxUnitPrice ?? ''}`;
  const [addedIds, setAddedIds] = useState<ReadonlySet<number>>(NO_IDS);
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(NO_IDS);
  /** What the last Add loaded, for "Added 8 items · …"; cleared by the next Find or Find more. */
  const [lastAdded, setLastAdded] = useState<{ count: number; volumeM3: number } | null>(null);
  const [resetFor, setResetFor] = useState(fillKey);
  if (resetFor !== fillKey) {
    setResetFor(fillKey);
    setAddedIds(NO_IDS);
    setUnticked(NO_IDS);
    setLastAdded(null);
  }
  // `reset` reads the added ids through a ref, so it keeps one identity for the page's reload button.
  const addedRef = useRef(addedIds);
  useEffect(() => {
    addedRef.current = addedIds;
  }, [addedIds]);

  /** Scan rows as the table shows them. */
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
  // Every row found so far, while a later batch runs too: the added ones stay in the table.
  const rows = useMemo(() => viewOf(scanned ?? NO_ROWS), [viewOf, scanned]);
  const addedRows = useMemo(
    () => (addedIds.size === 0 ? [] : rows.filter((r) => addedIds.has(r.typeId))),
    [rows, addedIds]
  );

  // Category per found row, for "Fuel Blocks · 9,000 m³": the scan has just read the types file, so it is cached.
  const [categoryOf, setCategoryOf] = useState<ReadonlyMap<number, number> | null>(null);
  useEffect(() => {
    if (scanned === null || scanned.length === 0 || groups === null) return;
    let cancelled = false;
    void loadMarketTypes()
      .then((types) => {
        const ids = scanned.map((r) => r.typeId);
        if (!cancelled) setCategoryOf(haulingCategoryOf(ids, groups, types));
      })
      .catch(() => {
        // The rows still show; only their category line is empty.
      });
    return () => {
      cancelled = true;
    };
  }, [scanned, groups]);

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
  /** `volumeM3` as the shown hold figures move (`shownAddedM3`). */
  const markAdded = (typeIds: readonly number[], volumeM3: number) => {
    setAddedIds((current) => new Set([...current, ...typeIds]));
    setLastAdded({ count: typeIds.length, volumeM3 });
  };
  /** Drops the fill and its added rows; returns the ids that were added, for the caller's pins. */
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
  /** False hides the offer (no Cargo Space, Any hub). */
  offered: boolean;
  current: readonly TripCandidate[];
  overrides: ReadonlyMap<number, TripOverride>;
  /** `planTrip` of `current` with `overrides`: the panel's plan. */
  before: TripPlan;
  base: Pick<Parameters<typeof planFill>[0], 'holds' | 'budgetIsk' | 'fees'>;
  categoryName: (categoryId: number) => string;
  /** Pins the added lines at the quantities shown. */
  pin: (lines: readonly { typeId: number; quantity: number }[]) => void;
}

/** The fill sized against the current plan: what `HaulingFillList` shows and what Add loads. */
export function useHaulingFillOffer(
  fill: HaulingFill,
  { offered, current, overrides, before, base, categoryName, pin }: HaulingFillOfferInput
) {
  // A failed batch keeps what earlier batches found on offer: only a running one hides it.
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

  // Lent to the batches (`bindSize`): each stop is judged on what the list would show.
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
  // A ref, not a prop: the plan this sizes against needs the fill's added rows, so it exists only after `useHaulingFill`.
  const { bindSize } = fill;
  useEffect(() => {
    bindSize(size);
  }, [bindSize, size]);

  const offer = useMemo(() => planOf(extras), [planOf, extras]);
  const offerLines = useMemo(() => offer?.lines ?? [], [offer]);
  // Every offered item starts ticked. The ticked ones are sized again on their
  // own (an unticked item frees room), so each line and Add show what Add loads.
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

  /** The plan once every offered item is in: what "Filled" reports and Find more is judged on. */
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
