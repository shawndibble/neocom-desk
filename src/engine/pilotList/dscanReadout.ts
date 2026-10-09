/**
 * The **Read-out** of a D-Scan (issue #3076): which pattern the scan reads as
 * (drop, scouts, mining fleet, roaming gang or mixed; first matching rule
 * wins) and the evidence lines that back it up.
 *
 * Wording stays a condition, never a verdict (decision 20260912-172628): this
 * module returns i18n keys and params, not sentences. Thresholds are starting
 * values, named so they can be tuned on real scans.
 *
 * Pure: the SDE lookups come in as `infoOf` and `nameOf`.
 */
import { roleOfType, type DscanRole, type DscanTypeInfo } from './dscanRoles';
import { formatDistanceKm } from './formatDistanceKm';
import type { DscanRow } from './parsePilotPaste';

export type ReadingId = 'drop' | 'scout' | 'mining' | 'gang' | 'mixed';
/** How loudly a danger reads: `none` is green, `warn` amber, `bad` red. */
export type Tone = 'none' | 'warn' | 'bad';

/** An i18n key under `travel.pilot.dscan.readout` plus its interpolation params. */
export interface ReadoutLine {
  key: string;
  params: Record<string, string | number>;
}

export interface Readout {
  reading: ReadingId;
  evidence: ReadoutLine[];
}

/** "Scouts": at most this many ships, each fast, covert or recon. */
export const SCOUT_MAX_SHIPS = 3;
/** "Mining fleet": miners and boosters are at least this share of the ships... */
export const MINING_MIN_SHARE = 0.5;
/** ...and combat ships are at most this share. */
export const MINING_MAX_COMBAT_SHARE = 0.15;
/** "Roaming PvP gang": at least this many combat ships... */
export const GANG_MIN_COMBAT = 5;
/** ...and either one hull is this share of the damage ships (a doctrine)... */
export const GANG_DOCTRINE_SHARE = 0.5;
/** ...or every combat ship sits within this many km of the others. */
export const GANG_MAX_SPREAD_KM = 25;
/** This many cruiser-size-or-larger damage ships read as "a gang" for "kill". */
export const KILL_GANG_MIN = 3;

/** Interdictor, Heavy Interdiction Cruiser, Interceptor. */
const TACKLE_SHIP_GROUPS = new Set([541, 894, 831]);
const MOBILE_WARP_DISRUPTOR_GROUP = 361;
/** Force Recon, Combat Recon. */
const RECON_GROUPS = new Set([833, 906]);
const COVERT_OPS_GROUP = 830;
const BLACK_OPS_GROUP = 898;
/** Frigate, Rookie Ship, Assault Frigate, Interceptor, Covert Ops, Stealth Bomber. */
const FAST_GROUPS = new Set([25, 237, 324, 831, COVERT_OPS_GROUP, 834]);
/** Logistics Cruiser, Logistics Frigate. */
const LOGISTICS_GROUPS = new Set([832, 1527]);
/** Industrial Command Ship, Capital Industrial: the hulls that boost miners. */
const BOOSTER_GROUPS = new Set([941, 883]);
/** Mobile Cynosural Beacon: a deployable that lets ships jump to it. */
const CYNO_BEACON_GROUP = 4093;

const SHIP_ROLES = new Set<DscanRole>(['capitals', 'industrial', 'transport', 'support', 'dps']);
const COMBAT_PROBE = /^combat scanner probe/i;
const CYNO_FIELD = /^cynosural field\b(?! generator)/i;

interface Ship {
  typeId: number;
  role: DscanRole;
  groupId: number;
  km: number | null;
}

const line = (key: string, params: Record<string, string | number> = {}): ReadoutLine => ({
  key,
  params,
});

function count<T>(items: readonly T[], test: (item: T) => boolean): number {
  return items.reduce((n, item) => n + (test(item) ? 1 : 0), 0);
}

/** The Read-out for a scan, or null when it holds no ship to read. */
export function buildReadout(
  rows: readonly DscanRow[],
  infoOf: (typeId: number) => DscanTypeInfo | undefined,
  nameOf: (typeId: number) => string
): Readout | null {
  const ships: Ship[] = [];
  let probes = 0;
  let cynos = 0;
  let disruptors = 0;
  for (const row of rows) {
    const info = infoOf(row.typeId);
    if (COMBAT_PROBE.test(row.typeName)) probes += 1;
    if (CYNO_FIELD.test(row.typeName) || info?.groupId === CYNO_BEACON_GROUP) cynos += 1;
    if (info?.groupId === MOBILE_WARP_DISRUPTOR_GROUP) disruptors += 1;
    const role = roleOfType(info, row.typeName);
    if (role === null || info === undefined || !SHIP_ROLES.has(role)) continue;
    ships.push({ typeId: row.typeId, role, groupId: info.groupId, km: row.distanceKm });
  }
  if (ships.length === 0) return null;

  const n = ships.length;
  const inGroups = (groups: ReadonlySet<number>) => count(ships, (s) => groups.has(s.groupId));
  const blackOps = count(ships, (s) => s.groupId === BLACK_OPS_GROUP);
  const capitals = count(ships, (s) => s.role === 'capitals');
  const logistics = inGroups(LOGISTICS_GROUPS);
  const boosters = inGroups(BOOSTER_GROUPS);
  const tackle = inGroups(TACKLE_SHIP_GROUPS) + disruptors;
  // Boosters (Orca, Rorqual) are industrial hulls too, so this counts each once.
  const miners = count(ships, (s) => s.role === 'industrial');
  const damage = ships.filter((s) => s.role === 'dps');
  const combat = ships.filter(
    (s) => (s.role === 'dps' || s.role === 'support') && s.groupId !== BLACK_OPS_GROUP
  );

  const hullCounts = new Map<number, number>();
  for (const s of damage) hullCounts.set(s.typeId, (hullCounts.get(s.typeId) ?? 0) + 1);
  const topHull = [...hullCounts].sort((a, b) => b[1] - a[1])[0];
  const topShare = topHull === undefined ? 0 : topHull[1] / damage.length;

  const combatKm = combat.flatMap((s) => (s.km === null ? [] : [s.km]));
  const combatSpread =
    combat.length > 0 && combatKm.length === combat.length
      ? Math.max(...combatKm) - Math.min(...combatKm)
      : null;
  const allKm = ships.flatMap((s) => (s.km === null ? [] : [s.km]));

  const evidence: ReadoutLine[] = [];
  let reading: ReadingId;
  if (cynos > 0 || (capitals > 0 && blackOps > 0)) {
    reading = 'drop';
    if (cynos > 0) evidence.push(line('ev.cyno'));
    if (blackOps > 0) evidence.push(line('ev.blackOps', { count: blackOps }));
    if (capitals > 0) evidence.push(line('ev.capitals', { count: capitals }));
  } else if (
    n <= SCOUT_MAX_SHIPS &&
    ships.every((s) => FAST_GROUPS.has(s.groupId) || RECON_GROUPS.has(s.groupId))
  ) {
    reading = 'scout';
    evidence.push(line('ev.scouts', { count: n }));
    if (probes > 0) evidence.push(line('ev.probes', { count: probes }));
  } else if (miners >= MINING_MIN_SHARE * n && combat.length <= MINING_MAX_COMBAT_SHARE * n) {
    reading = 'mining';
    evidence.push(line('ev.miners', { count: miners, total: n }));
    if (boosters > 0) evidence.push(line('ev.boosters', { count: boosters }));
    if (combat.length > 0) evidence.push(line('ev.fewCombat', { count: combat.length }));
  } else if (
    combat.length >= GANG_MIN_COMBAT &&
    (topShare >= GANG_DOCTRINE_SHARE ||
      (combatSpread !== null && combatSpread <= GANG_MAX_SPREAD_KM))
  ) {
    reading = 'gang';
    if (topHull !== undefined && topShare >= GANG_DOCTRINE_SHARE) {
      evidence.push(
        line('ev.doctrine', {
          count: topHull[1],
          hull: nameOf(topHull[0]),
          percent: Math.round(topShare * 100),
        })
      );
    }
    if (combatSpread !== null) {
      evidence.push(
        line('ev.together', { count: combat.length, distance: formatDistanceKm(combatSpread) })
      );
    }
    if (logistics > 0) evidence.push(line('ev.logistics', { count: logistics }));
    if (tackle > 0) evidence.push(line('ev.tackle', { count: tackle }));
  } else {
    reading = 'mixed';
    evidence.push(line('ev.hulls', { count: n, hulls: new Set(ships.map((s) => s.typeId)).size }));
    if (allKm.length > 1) {
      evidence.push(
        line('ev.spread', { distance: formatDistanceKm(Math.max(...allKm) - Math.min(...allKm)) })
      );
    }
  }
  return { reading, evidence };
}
