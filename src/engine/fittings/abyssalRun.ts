/**
 * Abyssal run rules: tier strengths, filament ids, hull eligibility, activation
 * flag; plus which weapon's reach the weather moved. Weather effects come from
 * the engine's beacons (`abyssalWeather.ts`). Sources and rationale: the
 * Abyssal run planner v1 scope decision.
 */
import { hullRankOf } from '@/engine/pilotList/dscanDanger';
import { wormholeSizeForShipGroup } from '@/engine/route/hullWormholeSize';
import type { AbyssalLevel, AbyssalWeatherKind } from './abyssalWeather';
import type { FittingStats, WeaponRange, WeaponRow } from './types';

export type AbyssalTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One run's clock: ship and pod are destroyed when it runs out. */
export const ABYSSAL_RUN_MINUTES = 20;
export const ABYSSAL_POCKETS = 3;

/** T0 Tranquil to T6 Cataclysmic; the names are UI copy (`fittings.abyssalRun.tierName`). */
export const ABYSSAL_TIERS: readonly AbyssalTier[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Weather strengths a tier can roll (a site rolls one): T0-T3 30% or 50%,
 * T4-T6 50% or 70% — beacon levels 1/2 and 2/3. Lowest first.
 */
export function abyssalTierLevels(tier: AbyssalTier): readonly [AbyssalLevel, AbyssalLevel] {
  return tier <= 3 ? [1, 2] : [2, 3];
}

/**
 * The tiers that roll `level`, lowest first: where to send a pilot whose
 * picked strength their tier never rolls. Always a run of adjacent tiers.
 */
export function abyssalTiersRolling(level: AbyssalLevel): readonly AbyssalTier[] {
  return ABYSSAL_TIERS.filter((tier) => abyssalTierLevels(tier).includes(level));
}

/** Type ids from the SDE (the ranges interleave and skip 56135, so listed outright). */
const FILAMENT_IDS: Readonly<Record<AbyssalTier, Readonly<Record<AbyssalWeatherKind, number>>>> = {
  0: { electrical: 56131, dark: 56132, exotic: 56133, firestorm: 56134, gamma: 56136 },
  1: { exotic: 47761, dark: 47762, firestorm: 47763, gamma: 47764, electrical: 47765 },
  2: { exotic: 47888, dark: 47892, firestorm: 47896, gamma: 47900, electrical: 47904 },
  3: { exotic: 47889, dark: 47893, firestorm: 47897, gamma: 47901, electrical: 47905 },
  4: { exotic: 47890, dark: 47894, firestorm: 47898, gamma: 47902, electrical: 47906 },
  5: { exotic: 47891, dark: 47895, firestorm: 47899, gamma: 47903, electrical: 47907 },
  6: { electrical: 56139, dark: 56140, exotic: 56141, firestorm: 56142, gamma: 56143 },
};

export function abyssalFilamentTypeId(tier: AbyssalTier, kind: AbyssalWeatherKind): number {
  return FILAMENT_IDS[tier][kind];
}

export type AbyssalShipClass = 'cruiser' | 'destroyer' | 'frigate';

export type AbyssalHullRule =
  | {
      eligible: true;
      shipClass: AbyssalShipClass;
      ships: 1 | 2 | 3;
      /** False where no source names the hull type, only its class. */
      confirmed: boolean;
    }
  | { eligible: false; reason: 'tech3Cruiser' | 'tooLarge' | 'unlisted' };

const TECH3_CRUISER_GROUP = 963;
// Interdictor, Command Destroyer: destroyer hulls no source names.
const UNCONFIRMED_GROUPS = new Set([541, 1534]);
// Rookie Ship, Flag Cruiser: sized by D-Scan, but no rule claimed.
const UNLISTED_GROUPS = new Set([237, 1972]);
const CLASS_BY_RANK = {
  1: { shipClass: 'frigate', ships: 3 },
  2: { shipClass: 'destroyer', ships: 2 },
  3: { shipClass: 'cruiser', ships: 1 },
} as const;

export function abyssalHullRule(groupId: number | undefined): AbyssalHullRule {
  if (groupId === undefined || UNLISTED_GROUPS.has(groupId))
    return { eligible: false, reason: 'unlisted' };
  if (groupId === TECH3_CRUISER_GROUP) return { eligible: false, reason: 'tech3Cruiser' };
  const rank = hullRankOf(groupId);
  if ((rank !== null && rank > 3) || wormholeSizeForShipGroup(groupId) === 'capital')
    return { eligible: false, reason: 'tooLarge' };
  if (rank === 1 || rank === 2 || rank === 3)
    return { eligible: true, ...CLASS_BY_RANK[rank], confirmed: !UNCONFIRMED_GROUPS.has(groupId) };
  return { eligible: false, reason: 'unlisted' };
}

/** The system's security rounded to a tenth, ×10 (1.0 = 10); 0 stands for below 0.5. */
export type AbyssalSecurity = 0 | 5 | 6 | 7 | 8 | 9 | 10;
export const ABYSSAL_SECURITY_BANDS: readonly AbyssalSecurity[] = [10, 9, 8, 7, 6, 5, 0];

export type AbyssalActivation = 'clear' | 'suspect' | 'blocked' | 'unpoliced';

/** The highest tier that activates without a flag, per high-security band. */
const HIGHEST_CLEAR_TIER: Readonly<Partial<Record<AbyssalSecurity, number>>> = {
  10: 0,
  9: 0,
  8: 3,
  7: 4,
  6: 5,
  5: 6,
};

/**
 * Whether a filament of `tier` opens in a system of `security`: not at all
 * (T1+ in 1.0 and 0.9), with the suspect flag (high tiers in the lower high
 * security), or clear. Below 0.5 no flag, but no CONCORD either: 'unpoliced'.
 */
export function abyssalActivation(tier: AbyssalTier, security: AbyssalSecurity): AbyssalActivation {
  const highestClear = HIGHEST_CLEAR_TIER[security];
  if (highestClear === undefined) return 'unpoliced';
  if (tier <= highestClear) return 'clear';
  return security >= 9 ? 'blocked' : 'suspect';
}

export interface WeaponReachChange {
  typeId: number;
  before: WeaponRange;
  after: WeaponRange;
}

const sameWeapon = (a: WeaponRow, b: WeaponRow) =>
  a.typeId === b.typeId && a.chargeTypeId === b.chargeTypeId && a.isDrone === b.isDrone;

/**
 * The longest-reaching weapon whose optimal or falloff moved between `before`
 * and `after` (Dark weather cuts turrets'); null when none did. Drones skipped:
 * they fly to their target.
 */
export function weaponReachChange(
  before: FittingStats,
  after: FittingStats
): WeaponReachChange | null {
  let found: WeaponReachChange | null = null;
  for (const row of before.offense.weapons) {
    if (row.isDrone || row.range === undefined) continue;
    const moved = after.offense.weapons.find((other) => sameWeapon(row, other))?.range;
    if (moved === undefined) continue;
    if (moved.optimal === row.range.optimal && moved.falloff === row.range.falloff) continue;
    const reach = row.range.optimal + row.range.falloff;
    if (found === null || reach > found.before.optimal + found.before.falloff)
      found = { typeId: row.typeId, before: row.range, after: moved };
  }
  return found;
}

export type AbyssalFilamentCost =
  { kind: 'covered' } | { kind: 'priced'; count: number; inCargo: number; total: number };

/**
 * What the run's filaments cost at the hub: the hull's `ships` count of one
 * type, less matching filaments in the open fit's own cargo. `covered` when
 * the cargo already holds enough; null when the hub has no price for what is
 * still missing, so the caller shows nothing rather than 0.
 */
export function abyssalFilamentCost(
  ships: number,
  filamentTypeId: number,
  price: number | null,
  cargo: readonly { typeId: number; quantity: number }[]
): AbyssalFilamentCost | null {
  const inCargo = cargo.reduce(
    (sum, item) => (item.typeId === filamentTypeId ? sum + item.quantity : sum),
    0
  );
  const count = Math.max(0, ships - inCargo);
  if (count === 0) return { kind: 'covered' };
  if (price === null || !(price > 0)) return null;
  return { kind: 'priced', count, inCargo: Math.min(inCargo, ships), total: count * price };
}
