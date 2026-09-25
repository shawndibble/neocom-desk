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
import type { CapacitorStatus, Fitting, FittingStats } from './types';

/** `null` means the field has no "better"/"worse" side — CPU/PG/calibration used-or-total, mass — so no value is highlighted. */
const STAT_DIRECTION: Readonly<Partial<Record<FittingStatKey, 'higher' | 'lower'>>> = {
  droneDps: 'higher',
  droneCapacity: 'higher',
  ehp: 'higher',
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

export interface CompareRow {
  key: StatChangeKey;
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

/** Every stat row for N fittings side by side — the differences-only toggle filters `rows` by `differs` at the UI layer. */
export function compareFittingStats(statsList: readonly FittingStats[]): CompareTable {
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
