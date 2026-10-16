/**
 * Planning an Abyssal Deadspace run: which weather strengths a filament tier
 * rolls, which filament to buy, whether a hull may enter, and whether the
 * activation security flags you. Pure rules; the weather's own effect on a
 * fit comes from the engine's beacons (`abyssalWeather.ts`), never from here.
 *
 * Sources: EVE University wiki "Abyssal Deadspace" (2026 rules: T0 usable in
 * 1.0/0.9 since 2026-05-19, fix 2026-06-16) and the SDE's filament types
 * (attribute 2761 is the tier, 2760 the weather). Where the wiki and an older
 * forum thread disagreed on strengths, the wiki was followed. No filament
 * carries an allowed-hull attribute in the SDE, so the hull groups below are
 * picked by hand from group names and are marked where unverified.
 */
import type { AbyssalWeatherKind } from './abyssalWeather';
import type { FittingStats, WeaponRange, WeaponRow } from './types';

export type AbyssalTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AbyssalLevel = 1 | 2 | 3;

/** One run's clock: ship and pod are destroyed when it runs out. */
export const ABYSSAL_RUN_MINUTES = 20;
export const ABYSSAL_POCKETS = 3;

/** T0 Tranquil to T6 Cataclysmic; the names are UI copy (`fittings.abyssalRun.tierName`). */
export const ABYSSAL_TIERS: readonly AbyssalTier[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Weather strengths a tier can roll (a site rolls one): T0-T3 30% or 50%,
 * T4-T6 50% or 70% — beacon levels 1/2 and 2/3. Lowest first.
 */
export function abyssalTierLevels(tier: AbyssalTier): readonly AbyssalLevel[] {
  return tier <= 3 ? [1, 2] : [2, 3];
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

// SDE inventory group ids. Cruiser: Cruiser, Heavy Assault, Logistics, Force
// Recon, Combat Recon, Heavy Interdiction.
const CRUISER_GROUPS = new Set([26, 358, 832, 833, 906, 894]);
const TECH3_CRUISER_GROUP = 963;
// Destroyer, Tech 3 Destroyer.
const DESTROYER_GROUPS = new Set([420, 1305]);
// Interdictor, Command Destroyer: destroyer hulls no source names.
const UNCONFIRMED_DESTROYER_GROUPS = new Set([541, 1534]);
// Frigate, Assault, Interceptor, Covert Ops, Electronic Attack, Stealth Bomber,
// Expedition, Logistics Frigate.
const FRIGATE_GROUPS = new Set([25, 324, 831, 830, 893, 834, 1283, 1527]);
// Battlecruisers (Combat, Attack, Command), battleships (Battleship, Black Ops,
// Marauder) and capitals.
const TOO_LARGE_GROUPS = new Set([419, 1201, 540, 27, 898, 900, 30, 485, 513, 547, 659, 1538, 883]);

/** What the hull's inventory group means for a run: how many ships go in, or why it can't. */
export function abyssalHullRule(groupId: number | undefined): AbyssalHullRule {
  if (groupId === undefined) return { eligible: false, reason: 'unlisted' };
  if (CRUISER_GROUPS.has(groupId))
    return { eligible: true, shipClass: 'cruiser', ships: 1, confirmed: true };
  if (groupId === TECH3_CRUISER_GROUP) return { eligible: false, reason: 'tech3Cruiser' };
  if (DESTROYER_GROUPS.has(groupId))
    return { eligible: true, shipClass: 'destroyer', ships: 2, confirmed: true };
  if (UNCONFIRMED_DESTROYER_GROUPS.has(groupId))
    return { eligible: true, shipClass: 'destroyer', ships: 2, confirmed: false };
  if (FRIGATE_GROUPS.has(groupId))
    return { eligible: true, shipClass: 'frigate', ships: 3, confirmed: true };
  if (TOO_LARGE_GROUPS.has(groupId)) return { eligible: false, reason: 'tooLarge' };
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
): { typeId: number; before: WeaponRange; after: WeaponRange } | null {
  let found: { typeId: number; before: WeaponRange; after: WeaponRange } | null = null;
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
