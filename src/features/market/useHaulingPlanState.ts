import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOnTrip, planTrip, type TripOverride } from '@/engine/market/haulingPlan';
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
  holds: readonly CargoHold[] | null;
  maxSpend: number | null;
  fees: HaulingFees;
  tableRows: readonly HaulingViewRow[];
  scanKey: string;
}

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
  const planBase = useMemo(
    () => ({ holds, budgetIsk: maxSpend, fees: fees.at(TRADE_HUBS[0]!) }),
    [holds, maxSpend, fees]
  );
  const plan = useMemo(
    () => planTrip({ ...planBase, candidates: tableCandidates, overrides }),
    [planBase, tableCandidates, overrides]
  );
  const lineOf = useMemo(() => new Map(plan.lines.map((l) => [l.typeId, l])), [plan]);
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

  const resetOverrides = () => setOverrides(NO_OVERRIDES);

  const clearAll = () =>
    setOverrides(new Map(tableRows.map((r) => [r.typeId, { selected: false }])));

  const allSelected = tableRows.length > 0 && tableRows.every((r) => isOnTrip(overrides, r.typeId));

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
  addedFromOf: (typeId: number) => string | null;
}

export function useHaulingExport({
  mode,
  anyEnd,
  tableRows,
  lineOf,
  overrides,
  addedFromOf,
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
        addedFromFor: (row) => addedFromOf(row.typeId),
        selectedFor: (row) => isOnTrip(overrides, row.typeId),
        flagText: (flag) => t(`market.hauling.flags.${HAULING_FLAG_KEY[flag]}`),
        bringFor: (row) => {
          const line = lineOf.get(row.typeId);
          if (!line || !isOnTrip(overrides, row.typeId)) return null;
          return line.quantity;
        },
      }),
    [t, mode, anyEnd, lineOf, overrides, addedFromOf]
  );
  return useTableExport({ surface: 'hauling', rows: tableRows, columns: csvColumns });
}
