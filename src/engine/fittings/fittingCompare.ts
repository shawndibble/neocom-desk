import {
  NUMERIC_FIELDS,
  round,
  type FittingStatKey,
  type StatChangeKey,
} from './fittingStatFields';
import { appliedDps, appliedDpsVsRange, bestRange, graphMaxRange } from './appliedDps';
import type { TargetProfile } from './targetProfile';
import type { CapacitorStatus, Fitting, FittingStats } from './types';

const STAT_DIRECTION: Readonly<Partial<Record<FittingStatKey, 'higher' | 'lower'>>> = {
  totalDps: 'higher',
  totalVolley: 'higher',
  sustainedDps: 'higher',
  overheatedDps: 'higher',
  burstTank: 'higher',
  sustainedTank: 'higher',
  capacitorDelta: 'higher',
  sensorStrength: 'higher',
  cargoCapacity: 'higher',
  droneControlRange: 'higher',
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

export type AppliedCompareKey = 'appliedDps' | 'bestRange';

export interface FittingPriceTotals {
  readonly sell: number;
  readonly buy: number;
}

export type PriceCompareKey = 'priceSell' | 'priceBuy';

export interface CompareRow {
  key: StatChangeKey | AppliedCompareKey | PriceCompareKey;
  values: readonly number[];
  differs: boolean;
  bestIndices: readonly number[];
}

export type CompareSectionId =
  | 'fitting'
  | 'offence'
  | 'tank'
  | 'resists'
  | 'capacitor'
  | 'targeting'
  | 'navigation'
  | 'drones'
  | 'ewar'
  | 'cost'
  | 'utility';

const SECTION_KEYS: readonly (readonly [CompareSectionId, readonly CompareRow['key'][]])[] = [
  [
    'fitting',
    [
      'cpuUsed',
      'cpuTotal',
      'powergridUsed',
      'powergridTotal',
      'calibrationUsed',
      'calibrationTotal',
    ],
  ],
  [
    'offence',
    [
      'totalDps',
      'totalVolley',
      'sustainedDps',
      'overheatedDps',
      'appliedDps',
      'bestRange',
      'reloadTime',
      'missileExplosionVelocity',
      'missileExplosionRadius',
    ],
  ],
  [
    'tank',
    [
      'ehp',
      'shieldRepair',
      'armorRepair',
      'hullRepair',
      'burstTank',
      'sustainedTank',
      'shieldHp',
      'armorHp',
      'hullHp',
    ],
  ],
  [
    'resists',
    [
      'shieldEmResonance',
      'shieldThermalResonance',
      'shieldKineticResonance',
      'shieldExplosiveResonance',
      'armorEmResonance',
      'armorThermalResonance',
      'armorKineticResonance',
      'armorExplosiveResonance',
      'hullEmResonance',
      'hullThermalResonance',
      'hullKineticResonance',
      'hullExplosiveResonance',
    ],
  ],
  [
    'capacitor',
    ['capacitorCapacity', 'capacitorRechargeTime', 'capacitorDelta', 'capacitor', 'capTransfer'],
  ],
  ['targeting', ['maxTargetRange', 'maxLockedTargets', 'scanResolution', 'sensorStrength']],
  [
    'navigation',
    ['signatureRadius', 'maxVelocity', 'agility', 'mass', 'warpSpeed', 'cargoCapacity'],
  ],
  [
    'drones',
    [
      'droneDps',
      'droneBandwidthUsed',
      'droneBandwidthTotal',
      'droneCapacity',
      'droneControlRange',
      'droneSpeed',
      'droneTracking',
    ],
  ],
  [
    'ewar',
    [
      'tacklePoints',
      'pointRange',
      'webStrength',
      'webRange',
      'ecmStrength',
      'ecmRange',
      'dampStrength',
      'dampRange',
      'disruptorStrength',
      'disruptorRange',
      'painterStrength',
      'painterRange',
      'neutralizer',
      'nosferatu',
    ],
  ],
  ['cost', ['priceSell', 'priceBuy']],
  [
    'utility',
    [
      'miningWaste',
      'dataStrength',
      'relicStrength',
      'utilitySlots',
      'virusCoherence',
      'hackingCycle',
      'scanStrength',
      'scanTimeCut',
      'deviationCut',
      'probeStrength',
      'probeLauncherBonus',
      'probeLauncherCycle',
      'cloakRecalibration',
      'warpsCloaked',
      'reactivationDelay',
      'salvageChance',
      'salvagerRange',
      'tractorSpeed',
      'tractorRange',
      'cargoScanRange',
      'shipScanRange',
    ],
  ],
];

export const COMPARE_SECTIONS: readonly CompareSectionId[] = SECTION_KEYS.map(([id]) => id);

export const COMPARE_SECTION_OF: ReadonlyMap<CompareRow['key'], CompareSectionId> = new Map(
  SECTION_KEYS.flatMap(([id, keys]) => keys.map((key) => [key, id] as const))
);

export function compareSection(key: CompareRow['key']): CompareSectionId {
  return COMPARE_SECTION_OF.get(key) ?? 'utility';
}

export interface CompareSection {
  section: CompareSectionId;
  rows: readonly CompareRow[];
}

export function sectionCompareRows(rows: readonly CompareRow[]): CompareSection[] {
  return COMPARE_SECTIONS.flatMap((section) => {
    const own = rows.filter((row) => compareSection(row.key) === section);
    return own.length > 0 ? [{ section, rows: own }] : [];
  });
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
    values: statsList.map((s) =>
      round(s.capacitor.stable ? s.capacitor.stablePercentage : -s.capacitor.depletesInSeconds, 0)
    ),
    differs,
    bestIndices,
  };
}

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

function priceRows(prices: readonly (FittingPriceTotals | null)[]): CompareRow[] {
  const sell = prices.map((p) => (p ? round(p.sell, 0) : NaN));
  const buy = prices.map((p) => (p ? round(p.buy, 0) : NaN));
  return [
    { key: 'priceSell', values: sell, differs: new Set(sell).size > 1, bestIndices: [] },
    { key: 'priceBuy', values: buy, differs: new Set(buy).size > 1, bestIndices: [] },
  ];
}

export function compareFittingStats(
  statsList: readonly FittingStats[],
  target?: TargetProfile,
  prices?: readonly (FittingPriceTotals | null)[]
): CompareTable {
  const rows: CompareRow[] = NUMERIC_FIELDS.flatMap((field) => {
    const values = statsList.map((s) => round(field.value(s), field.digits));
    if (!field.hideWhenNone)
      return [
        {
          key: field.key,
          values,
          differs: new Set(values).size > 1,
          bestIndices: bestIndicesFor(values, STAT_DIRECTION[field.key]),
        },
      ];
    if (values.every((value) => value === 0)) return [];
    const ranked = field.direction === 'lower' ? values.map((v) => v || Infinity) : values;
    return [
      {
        key: field.key,
        values,
        differs: new Set(values).size > 1,
        bestIndices: bestIndicesFor(
          ranked,
          field.direction === 'neutral' ? undefined : field.direction
        ).filter((index) => values[index] !== 0),
      },
    ];
  });
  rows.push(capacitorRow(statsList));
  if (target) rows.push(...appliedRows(statsList, target));
  if (prices) rows.push(...priceRows(prices));
  return { rows };
}

export interface ModuleDiffEntry {
  typeId: number;
  counts: readonly number[];
}

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

export function compareWindow(count: number, page: number): { start: number; end: number } {
  if (count <= 2) return { start: 0, end: count };
  const lastPage = count - 2;
  const clamped = Math.max(0, Math.min(page, lastPage));
  return { start: clamped, end: clamped + 2 };
}
