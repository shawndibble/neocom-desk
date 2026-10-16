/**
 * Hauling's "Fill the free space": the on-demand scan, the rows added from it,
 * and the offer sized into the room the plan leaves. Two hooks: the offer
 * needs the plan, and the plan needs the added rows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planFill } from '@/engine/market/haulingFill';
import type { TripCandidate, TripOverride, TripPlan } from '@/engine/market/haulingPlan';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketGroupNode } from '@/sde/marketTypes';
import { haulingCategoryOf } from './haulingCategories';
import type { HaulMode } from './haulingData';
import type { HaulingEnd } from './haulingHubs';
import type { HaulingFillItem, HaulingFillListProps } from './HaulingTripRail';
import {
  filterHaulingRows,
  toViewRows,
  type HaulingFeesAt,
  type HaulingFilters,
  type HaulingViewRow,
} from './haulingView';
import { useHaulingFillScan } from './useHaulingFillScan';

const NO_IDS: ReadonlySet<number> = new Set();

export interface HaulingFillInput {
  from: HaulingEnd;
  to: HaulingEnd;
  categoryId: number;
  mode: HaulMode;
  /** The route, category and mode as one key: a new one drops the fill and its added rows. */
  laneKey: string;
  feesAt: HaulingFeesAt;
  filters: HaulingFilters;
  groups: readonly MarketGroupNode[] | null;
}

export function useHaulingFill({
  from,
  to,
  categoryId,
  mode,
  laneKey,
  feesAt,
  filters,
  groups,
}: HaulingFillInput) {
  const [requested, setRequested] = useState(false);
  const [addedIds, setAddedIds] = useState<ReadonlySet<number>>(NO_IDS);
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(NO_IDS);
  const [resetFor, setResetFor] = useState(laneKey);
  if (resetFor !== laneKey) {
    setResetFor(laneKey);
    setRequested(false);
    setAddedIds(NO_IDS);
    setUnticked(NO_IDS);
  }
  // `reset` reads the added ids through a ref, so it keeps one identity for the page's reload button.
  const addedRef = useRef(addedIds);
  useEffect(() => {
    addedRef.current = addedIds;
  }, [addedIds]);

  const scan = useHaulingFillScan(from, to, categoryId, mode, requested);
  const rows = useMemo(
    () =>
      scan.state.status === 'ready'
        ? filterHaulingRows(toViewRows(scan.state.scan.rows, feesAt), filters).shown
        : [],
    [scan.state, feesAt, filters]
  );
  const addedRows = useMemo(
    () => (addedIds.size === 0 ? [] : rows.filter((r) => addedIds.has(r.typeId))),
    [rows, addedIds]
  );

  // Category per scanned row, for "Fuel Blocks · 9,000 m³": the scan has just read the types file, so it is cached.
  const [categoryOf, setCategoryOf] = useState<ReadonlyMap<number, number> | null>(null);
  const scanned = scan.state.status === 'ready' ? scan.state.scan.rows : null;
  useEffect(() => {
    if (scanned === null || groups === null) return;
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

  const find = () => {
    // The scan starts when first asked; a retry re-scans through `refresh`.
    if (requested) scan.refresh();
    else setRequested(true);
  };
  const toggle = (typeId: number, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  const markAdded = (typeIds: readonly number[]) =>
    setAddedIds((current) => new Set([...current, ...typeIds]));
  /** Drops the fill and its added rows; returns the ids that were added, for the caller's pins. */
  const reset = useCallback((): ReadonlySet<number> => {
    const dropped = addedRef.current;
    setRequested(false);
    setAddedIds(NO_IDS);
    setUnticked(NO_IDS);
    return dropped;
  }, []);

  return {
    status: scan.state.status,
    progress: scan.state.status === 'loading' ? scan.state.progress : null,
    requested,
    rows,
    addedIds,
    addedRows,
    unticked,
    categoryOf,
    find,
    toggle,
    markAdded,
    reset,
  };
}

export type HaulingFill = ReturnType<typeof useHaulingFill>;

export interface HaulingFillOfferInput {
  /** False hides the offer (Everything, no Cargo Space, Any hub). */
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
  const extras = useMemo(
    () => (offered ? fill.rows.filter((r) => !fill.addedIds.has(r.typeId)) : []),
    [offered, fill.rows, fill.addedIds]
  );
  const planOf = useCallback(
    (rows: readonly HaulingViewRow[]) =>
      rows.length === 0
        ? null
        : planFill({ ...base, current, overrides, before, extras: rows.map((r) => r.candidate) }),
    [base, current, overrides, before]
  );
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
    const lines = ticked?.lines ?? [];
    if (lines.length === 0) return;
    fill.markAdded(lines.map((l) => l.typeId));
    pin(lines);
  };

  const list: Omit<HaulingFillListProps, 'freeM3' | 'progressText'> = {
    status: fill.status,
    items,
    ticked: new Set(offerLines.filter((l) => !fill.unticked.has(l.typeId)).map((l) => l.typeId)),
    onToggle: fill.toggle,
    onFind: fill.find,
    onAdd: add,
    tickedTotals: {
      count: ticked?.lines.length ?? 0,
      volumeM3: ticked?.added.volumeM3 ?? 0,
      cost: ticked?.added.cost ?? 0,
      profit: ticked?.added.profit ?? 0,
    },
    holdAfter: ticked
      ? ticked.after.holds.reduce(
          (sum, h) => ({
            usedM3: sum.usedM3 + h.usedM3,
            capacityM3: sum.capacityM3 + h.capacityM3,
          }),
          { usedM3: 0, capacityM3: 0 }
        )
      : null,
  };
  return { list, cargoValueAfterFill: ticked ? ticked.after.totals.cost : null };
}
