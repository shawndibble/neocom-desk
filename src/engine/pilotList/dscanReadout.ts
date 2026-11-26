import { roleOfType, type DscanRole, type DscanTypeInfo } from './dscanRoles';
import { formatDistanceKm } from './formatDistanceKm';
import type { DscanRow } from './parsePilotPaste';

export type ReadingId = 'drop' | 'scout' | 'mining' | 'gang' | 'mixed';
export type Tone = 'none' | 'warn' | 'bad';

export interface ReadoutLine {
  key: string;
  params: Record<string, string | number>;
}

export interface Readout {
  reading: ReadingId;
  evidence: ReadoutLine[];
}

export const SCOUT_MAX_SHIPS = 3;
export const MINING_MIN_SHARE = 0.5;
export const MINING_MAX_COMBAT_SHARE = 0.15;
export const GANG_MIN_COMBAT = 5;
export const GANG_DOCTRINE_SHARE = 0.5;
export const GANG_MAX_SPREAD_KM = 25;
export const KILL_GANG_MIN = 3;

const TACKLE_SHIP_GROUPS = new Set([541, 894, 831]);
const MOBILE_WARP_DISRUPTOR_GROUP = 361;
const RECON_GROUPS = new Set([833, 906]);
const COVERT_OPS_GROUP = 830;
const BLACK_OPS_GROUP = 898;
const FAST_GROUPS = new Set([25, 237, 324, 831, COVERT_OPS_GROUP, 834]);
const LOGISTICS_GROUPS = new Set([832, 1527]);
const BOOSTER_GROUPS = new Set([941, 883]);
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
