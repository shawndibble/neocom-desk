/**
 * Fitting vs Fitting compare: up to three Fittings' stats and modules side
 * by side. Shares `fittingStatFields.ts`'s field list and rounding with
 * `variationDelta.ts`'s before/after diff, generalised here to N-way.
 */
import {
  NUMERIC_FIELDS,
  round,
  type FittingStatKey,
  type StatChangeKey,
} from './fittingStatFields';
import { appliedDps, appliedDpsVsRange, bestRange, graphMaxRange } from './appliedDps';
import type { TargetProfile } from './targetProfile';
import type { CapacitorStatus, Fitting, FittingStats } from './types';

/** `null` means the field has no "better"/"worse" side — CPU/PG/calibration used-or-total, mass — so no value is highlighted. */
const STAT_DIRECTION: Readonly<Partial<Record<FittingStatKey, 'higher' | 'lower'>>> = {
  totalDps: 'higher',
  totalVolley: 'higher',
  droneDps: 'higher',
  droneCapacity: 'higher',
  ehp: 'higher',
  shieldRepair: 'higher',
  armorRepair: 'higher',
  hullRepair: 'higher',
  capacitorCapacity: 'higher',
  capacitorRechargeTime: 'lower',
  shieldHp: 'higher',
  shieldEmResonance: 'higher',
  shieldThermalResonance: 'higher',
  shieldKineticResonance: 'higher',
  shieldExplosiveResonance: 'higher',
  armorHp: 'higher',
  armorEmResonance: 'higher',
  armorThermalResonance: 'higher',
  armorKineticResonance: 'higher',
  armorExplosiveResonance: 'higher',
  hullHp: 'higher',
  hullEmResonance: 'higher',
  hullThermalResonance: 'higher',
  hullKineticResonance: 'higher',
  hullExplosiveResonance: 'higher',
  maxTargetRange: 'higher',
  maxLockedTargets: 'higher',
  scanResolution: 'higher',
  signatureRadius: 'lower',
  maxVelocity: 'higher',
  agility: 'lower',
  warpSpeed: 'higher',
};

/** The two rows worked out against the selected Target Profile, not read off `FittingStats`. */
export type AppliedCompareKey = 'appliedDps' | 'bestRange';

/** Fit-wide sell/buy totals — the two figures this table needs out of `loadFittingPrice`'s wider `Appraisal.totals` (which also carries spread, refine, and unpriced-row counts this compare doesn't use). */
export interface FittingPriceTotals {
  readonly sell: number;
  readonly buy: number;
}

/** The two rows a caller supplies once its (async, non-pure) price fetch has settled for every compared Fitting. */
export type PriceCompareKey = 'priceSell' | 'priceBuy';

export interface CompareRow {
  key: StatChangeKey | AppliedCompareKey | PriceCompareKey;
  /** Index-parallel to the input fittings, rounded at the same digits `FittingStatsSections` displays. */
  values: readonly number[];
  /** `false` when every fitting rounds to the same value. */
  differs: boolean;
  /** Indices tied for best; empty when the field has no direction or nothing differs. */
  bestIndices: readonly number[];
}

export interface CompareTable {
  rows: readonly CompareRow[];
}

function bestIndicesFor(
  values: readonly number[],
  direction: 'higher' | 'lower' | undefined
): number[] {
  if (!direction || new Set(values).size <= 1) return [];
  const target = direction === 'higher' ? Math.max(...values) : Math.min(...values);
  return values.flatMap((value, index) => (value === target ? [index] : []));
}

/** Stable beats unstable; among stable, higher percentage wins; among unstable, longer depletion wins. */
function capacitorRank(status: CapacitorStatus): [stable: number, metric: number] {
  return status.stable ? [1, status.stablePercentage] : [0, status.depletesInSeconds];
}

function capacitorRow(statsList: readonly FittingStats[]): CompareRow {
  const rounded = statsList.map((s): [number, number] => {
    const [stable, metric] = capacitorRank(s.capacitor);
    return [stable, round(metric, 0)];
  });
  const differs = new Set(rounded.map(([stable, metric]) => `${stable}:${metric}`)).size > 1;
  let bestIndices: number[] = [];
  if (differs) {
    const best = rounded.reduce((a, b) => (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a));
    bestIndices = rounded.flatMap(([stable, metric], index) =>
      stable === best[0] && metric === best[1] ? [index] : []
    );
  }
  return {
    key: 'capacitor',
    // Negated on the unstable side, matching `variationDelta.ts`'s own
    // `capacitorChange` metric — `FittingCompareTable`'s `formatValue` reads
    // that sign to tell stable from unstable back apart.
    values: statsList.map((s) =>
      round(s.capacitor.stable ? s.capacitor.stablePercentage : -s.capacitor.depletesInSeconds, 0)
    ),
    differs,
    bestIndices,
  };
}

/**
 * Applied DPS and the range it peaks at (km), per fitting, on the same range axis the single-Fitting
 * page uses for a lone Fitting (`graphMaxRange`) so the numbers match. No firing weapons: 0 and 0.
 */
function appliedRows(statsList: readonly FittingStats[], target: TargetProfile): CompareRow[] {
  const points = statsList.map(({ applied }) => {
    const at = bestRange(appliedDpsVsRange(applied, target, graphMaxRange([applied])));
    return { dps: round(appliedDps(applied, target, at), 1), km: round(at / 1000, 1) };
  });
  const dps = points.map((p) => p.dps);
  const km = points.map((p) => p.km);
  return [
    {
      key: 'appliedDps',
      values: dps,
      differs: new Set(dps).size > 1,
      bestIndices: bestIndicesFor(dps, 'higher'),
    },
    { key: 'bestRange', values: km, differs: new Set(km).size > 1, bestIndices: [] },
  ];
}

/**
 * No "better"/"worse" side for cost — a cheaper fit isn't necessarily the right pick for a doctrine, so neither
 * price row is highlighted. A `null` entry (that slot's price fetch failed) becomes `NaN` — `formatValue` renders
 * it as a dash, and `Set`'s same-value-zero equality treats every `NaN` as equal, so failed slots never register
 * as "differing" against each other.
 */
function priceRows(prices: readonly (FittingPriceTotals | null)[]): CompareRow[] {
  const sell = prices.map((p) => (p ? round(p.sell, 0) : NaN));
  const buy = prices.map((p) => (p ? round(p.buy, 0) : NaN));
  return [
    { key: 'priceSell', values: sell, differs: new Set(sell).size > 1, bestIndices: [] },
    { key: 'priceBuy', values: buy, differs: new Set(buy).size > 1, bestIndices: [] },
  ];
}

/**
 * Every stat row for N fittings side by side — the differences-only toggle filters `rows` by `differs` at the UI layer.
 * Passing a `target` adds the applied-DPS rows. Passing `prices` (index-parallel to `statsList`, `null` for a slot
 * whose price fetch failed) adds the sell/buy rows — the whole pair is omitted while any slot is still in flight,
 * but a settled failure on one slot doesn't hide the slots that priced.
 */
export function compareFittingStats(
  statsList: readonly FittingStats[],
  target?: TargetProfile,
  prices?: readonly (FittingPriceTotals | null)[]
): CompareTable {
  const rows: CompareRow[] = NUMERIC_FIELDS.map((field) => {
    const values = statsList.map((s) => round(field.value(s), field.digits));
    return {
      key: field.key,
      values,
      differs: new Set(values).size > 1,
      bestIndices: bestIndicesFor(values, STAT_DIRECTION[field.key]),
    };
  });
  rows.push(capacitorRow(statsList));
  if (target) rows.push(...appliedRows(statsList, target));
  if (prices) rows.push(...priceRows(prices));
  return { rows };
}

export interface ModuleDiffEntry {
  typeId: number;
  /** Index-parallel to the input fittings; 0 when that fitting doesn't carry it. */
  counts: readonly number[];
}

/** Module type ids whose stack count is not identical across every fitting — a hull swap makes every module "differ". */
export function modulesThatDiffer(fittings: readonly Fitting[]): ModuleDiffEntry[] {
  const typeIds = new Set<number>();
  const countsByFitting = fittings.map((fitting) => {
    const counts = new Map<number, number>();
    for (const module of fitting.modules) {
      counts.set(module.typeId, (counts.get(module.typeId) ?? 0) + 1);
      typeIds.add(module.typeId);
    }
    return counts;
  });
  const result: ModuleDiffEntry[] = [];
  for (const typeId of [...typeIds].sort((a, b) => a - b)) {
    const counts = countsByFitting.map((byType) => byType.get(typeId) ?? 0);
    if (new Set(counts).size > 1) result.push({ typeId, counts });
  }
  return result;
}

/** A sliding 2-column window over up to 3 compare slots for phone paging; 1-2 fittings show in full, never a lone column. */
export function compareWindow(count: number, page: number): { start: number; end: number } {
  if (count <= 2) return { start: 0, end: count };
  const lastPage = count - 2;
  const clamped = Math.max(0, Math.min(page, lastPage));
  return { start: clamped, end: clamped + 2 };
}
