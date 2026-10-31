import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { planTrip, type TripOverride } from '@/engine/market/haulingPlan';
import type { CargoHold } from '@/engine/market/cargoHolds';
import { useTableExport } from '@/components/ui/useTableExport';
import { TRADE_HUBS } from '@/market/hubs';
import { haulingCsvColumns } from './haulingCsv';
import { HAULING_FLAG_KEY } from './haulingFlagKeys';
import type { HaulingAnyEnd } from './haulingHubs';
import type { HaulMode } from './haulingData';
import type { HaulingViewRow } from './haulingView';
import type { HaulingFees } from './useHaulingScan';

const NO_OVERRIDES: ReadonlyMap<number, TripOverride> = new Map();

interface HaulingPlanStateInput {
  /** The Cargo Space's holds, or null while none is set. */
  holds: readonly CargoHold[] | null;
  /** Max spend, whole ISK; null is no limit. */
  maxSpend: number | null;
  fees: HaulingFees;
  /** The rows on the table: the scan's shown rows plus any added from the fill. */
  tableRows: readonly HaulingViewRow[];
  /** A new route, category or mode starts a fresh plan. */
  scanKey: string;
}

/**
 * The Trip Plan and the user's edits to it. The edits (`overrides`) belong to
 * one scan: a new `scanKey` drops them. Every row starts ticked at a suggested
 * quantity; unticking or typing a number re-sizes the rest through `planTrip`.
 */
export function useHaulingPlanState({
  holds,
  maxSpend,
  fees,
  tableRows,
  scanKey,
}: HaulingPlanStateInput) {
  const [overrides, setOverrides] = useState<ReadonlyMap<number, TripOverride>>(NO_OVERRIDES);
  const [overridesFor, setOverridesFor] = useState(scanKey);
  if (overridesFor !== scanKey) {
    setOverridesFor(scanKey);
    setOverrides(NO_OVERRIDES);
  }

  const tableCandidates = useMemo(() => tableRows.map((r) => r.candidate), [tableRows]);
  // Every candidate carries its own destination's fees; `fees` here is only the fallback.
  const planBase = useMemo(
    () => ({ holds, budgetIsk: maxSpend, fees: fees.at(TRADE_HUBS[0]!) }),
    [holds, maxSpend, fees]
  );
  const plan = useMemo(
    () => planTrip({ ...planBase, candidates: tableCandidates, overrides }),
    [planBase, tableCandidates, overrides]
  );
  const lineOf = useMemo(() => new Map(plan.lines.map((l) => [l.typeId, l])), [plan]);
  // The Profit column sorts by the suggestion, not the edited plan: unticking
  // a row or typing in Bring must not move the row out from under the pointer.
  // Unedited, the suggestion is the plan itself.
  const noEdits = overrides.size === 0;
  const suggestion = useMemo(
    () =>
      noEdits
        ? null
        : planTrip({ ...planBase, candidates: tableCandidates, overrides: NO_OVERRIDES }),
    [noEdits, planBase, tableCandidates]
  );
  const suggestedProfitOf = useMemo(
    () => new Map((suggestion ?? plan).lines.map((l) => [l.typeId, l.profit])),
    [suggestion, plan]
  );

  function patchOverride(typeId: number, patch: TripOverride | null) {
    setOverrides((current) => {
      const next = new Map(current);
      if (patch === null) next.delete(typeId);
      else next.set(typeId, { ...current.get(typeId), ...patch });
      return next;
    });
  }

  /** Drops every edit: Select all's on state, and the menu's Fill hold. */
  const resetOverrides = () => setOverrides(NO_OVERRIDES);

  /** Unticks every row: Select all's off state, and the menu's Clear all. */
  const clearAll = () =>
    setOverrides(new Map(tableRows.map((r) => [r.typeId, { selected: false }])));

  const allSelected =
    tableRows.length > 0 && tableRows.every((r) => overrides.get(r.typeId)?.selected !== false);

  return {
    overrides,
    setOverrides,
    tableCandidates,
    planBase,
    plan,
    lineOf,
    suggestedProfitOf,
    patchOverride,
    resetOverrides,
    clearAll,
    allSelected,
  };
}

interface HaulingExportInput {
  mode: HaulMode;
  anyEnd: HaulingAnyEnd;
  tableRows: readonly HaulingViewRow[];
  lineOf: ReadonlyMap<number, { quantity: number; profit: number; volumeM3: number }>;
  overrides: ReadonlyMap<number, TripOverride>;
  /** Rows added by the fill, and the category each came from. */
  addedIds: ReadonlySet<number>;
  addedCategoryOf: ReadonlyMap<number, number> | null | undefined;
  categoryName: (id: number) => string;
}

/** The table's CSV/clipboard export: Bring is the planned quantity, blank for an unticked row. */
export function useHaulingExport({
  mode,
  anyEnd,
  tableRows,
  lineOf,
  overrides,
  addedIds,
  addedCategoryOf,
  categoryName,
}: HaulingExportInput) {
  const { t } = useTranslation();
  const csvColumns = useMemo(
    () =>
      haulingCsvColumns(t, {
        mode,
        anyEnd,
        profitFor: (row) => {
          const line = lineOf.get(row.typeId);
          return !line || line.quantity === 0 ? null : line.profit;
        },
        holdM3For: (row) => lineOf.get(row.typeId)?.volumeM3 ?? null,
        addedFromFor: (row) => {
          const category = addedIds.has(row.typeId) ? addedCategoryOf?.get(row.typeId) : undefined;
          return category === undefined ? null : categoryName(category);
        },
        selectedFor: (row) => overrides.get(row.typeId)?.selected !== false,
        flagText: (flag) => t(`market.hauling.flags.${HAULING_FLAG_KEY[flag]}`),
        bringFor: (row) => {
          const line = lineOf.get(row.typeId);
          if (!line || overrides.get(row.typeId)?.selected === false) return null;
          return line.quantity;
        },
      }),
    [t, mode, anyEnd, lineOf, overrides, addedIds, addedCategoryOf, categoryName]
  );
  return useTableExport({ surface: 'hauling', rows: tableRows, columns: csvColumns });
}
