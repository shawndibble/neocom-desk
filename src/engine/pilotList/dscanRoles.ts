/**
 * Reads a pasted D-Scan as a **Fleet board** (issue #3075): every row filed
 * under a role by SDE group, so "what is this fleet?" has a one-glance answer.
 * Group ids are pinned here because `types.json` carries only a type's group
 * id; the tests pin each id to its role.
 *
 * Pure: the SDE lookup comes in as `infoOf`.
 */
import type { DscanRow } from './parsePilotPaste';

export type DscanRole =
  'capitals' | 'industrial' | 'transport' | 'support' | 'dps' | 'drones' | 'structures';

export interface DscanTypeInfo {
  groupId: number;
  categoryId: number;
}

export interface FleetHull {
  typeId: number;
  groupId: number | null;
  count: number;
  /** Nearest and farthest of the hull's known distances, km. */
  minKm: number | null;
  maxKm: number | null;
  /** A ship name 2+ of this hull share ("4 named OR:E"), a hint of one owner. */
  nameHint: { name: string; count: number } | null;
}

export interface FleetRole {
  role: DscanRole;
  total: number;
  /** Share of everything the board counted, 0 to 100. */
  percent: number;
  /** Each hull once, most numerous first. */
  hulls: FleetHull[];
  /** Known distances in km, nearest first: one dot each in the lanes. */
  distancesKm: number[];
}

export interface FleetBoard {
  /** Non-empty roles, in display order. */
  roles: FleetRole[];
  /** Rows filed under a role. */
  counted: number;
  /** Capsules, shuttles, probes, celestials and types the SDE doesn't know. */
  leftOut: number;
}

/** The lanes chart's axis runs 0 to this many km; farther rows pin to the edge. */
export const DSCAN_AXIS_KM = 150;

const SHIP_CATEGORY = 6;
const DRONE_CATEGORIES = new Set([18, 87, 22]); // Drone, Fighter, Deployable
const STRUCTURE_CATEGORIES = new Set([65, 23]); // Upwell structure, Starbase

/** Carrier, Dreadnought, Supercarrier, Titan, Force Auxiliary, Lancer Dreadnought. */
const CAPITAL_GROUPS = new Set([547, 485, 659, 30, 1538, 4594]);
/** Exhumer, Mining Barge, Industrial Command Ship, Capital Industrial, Expedition Frigate. */
const INDUSTRIAL_GROUPS = new Set([543, 463, 941, 883, 1283]);
/** Industrial, Deep Space Transport, Blockade Runner, Freighter, Jump Freighter. */
const TRANSPORT_GROUPS = new Set([28, 380, 1202, 513, 902]);
/**
 * Logistics Cruiser/Frigate, Command Ship/Destroyer, Force Recon, Combat Recon,
 * Interdictor, Heavy Interdiction Cruiser, Electronic Attack Ship, Black Ops,
 * Covert Ops. (Stealth Bombers deal damage, so they are DPS.)
 */
const SUPPORT_GROUPS = new Set([832, 1527, 540, 1534, 833, 906, 541, 894, 893, 898, 830]);
/** Customs Office (category 46, so not covered by the structure categories). */
const STRUCTURE_GROUPS = new Set([1025]);
/** Capsule, Shuttle: ships, but no part of a fleet. */
const NOT_A_FLEET_GROUPS = new Set([29, 31]);

/** Every group id pinned to a role above — each needs a sub-label string. */
export const PINNED_GROUP_IDS: readonly number[] = [
  ...CAPITAL_GROUPS,
  ...INDUSTRIAL_GROUPS,
  ...TRANSPORT_GROUPS,
  ...SUPPORT_GROUPS,
  ...STRUCTURE_GROUPS,
];

const ORDER: readonly DscanRole[] = [
  'capitals',
  'industrial',
  'transport',
  'support',
  'dps',
  'drones',
  'structures',
];

/**
 * The role a type belongs to, or null when it belongs to none. `typeName` is
 * the column the client printed: the SDE holds no wreck types, so a wreck is
 * the only thing recognised by name.
 */
export function roleOfType(info: DscanTypeInfo | undefined, typeName: string): DscanRole | null {
  if (info === undefined) return /\bwreck$/i.test(typeName.trim()) ? 'structures' : null;
  const { groupId, categoryId } = info;
  if (CAPITAL_GROUPS.has(groupId)) return 'capitals';
  if (INDUSTRIAL_GROUPS.has(groupId)) return 'industrial';
  if (TRANSPORT_GROUPS.has(groupId)) return 'transport';
  if (SUPPORT_GROUPS.has(groupId)) return 'support';
  if (STRUCTURE_GROUPS.has(groupId) || STRUCTURE_CATEGORIES.has(categoryId)) return 'structures';
  if (DRONE_CATEGORIES.has(categoryId)) return 'drones';
  if (categoryId === SHIP_CATEGORY) return NOT_A_FLEET_GROUPS.has(groupId) ? null : 'dps';
  return null;
}

function nameHintOf(rows: readonly DscanRow[]): FleetHull['nameHint'] {
  const counts = new Map<string, number>();
  for (const { name, typeName } of rows) {
    if (name === '' || name === typeName) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: FleetHull['nameHint'] = null;
  for (const [name, count] of counts) {
    if (count >= 2 && (best === null || count > best.count)) best = { name, count };
  }
  return best;
}

function hullOf(
  typeId: number,
  rows: readonly DscanRow[],
  info: DscanTypeInfo | undefined
): FleetHull {
  const km = rows.flatMap((r) => (r.distanceKm === null ? [] : [r.distanceKm]));
  return {
    typeId,
    groupId: info?.groupId ?? null,
    count: rows.length,
    minKm: km.length === 0 ? null : Math.min(...km),
    maxKm: km.length === 0 ? null : Math.max(...km),
    nameHint: nameHintOf(rows),
  };
}

export function buildFleetBoard(
  rows: readonly DscanRow[],
  infoOf: (typeId: number) => DscanTypeInfo | undefined
): FleetBoard {
  const byRole = new Map<DscanRole, Map<number, DscanRow[]>>();
  let leftOut = 0;
  for (const row of rows) {
    const role = roleOfType(infoOf(row.typeId), row.typeName);
    if (role === null) {
      leftOut += 1;
      continue;
    }
    const hulls = byRole.get(role) ?? new Map<number, DscanRow[]>();
    hulls.set(row.typeId, [...(hulls.get(row.typeId) ?? []), row]);
    byRole.set(role, hulls);
  }
  const counted = rows.length - leftOut;
  const roles: FleetRole[] = [];
  for (const role of ORDER) {
    const hulls = byRole.get(role);
    if (hulls === undefined) continue;
    const list = [...hulls].map(([typeId, hullRows]) => hullOf(typeId, hullRows, infoOf(typeId)));
    list.sort((a, b) => b.count - a.count);
    const total = list.reduce((sum, h) => sum + h.count, 0);
    const distancesKm = [...hulls.values()]
      .flat()
      .flatMap((r) => (r.distanceKm === null ? [] : [r.distanceKm]))
      .sort((a, b) => a - b);
    roles.push({ role, total, percent: (total / counted) * 100, hulls: list, distancesKm });
  }
  return { roles, counted, leftOut };
}

/** Where a distance falls on the lanes axis, as a 0 to 1 fraction. */
export function laneOffset(km: number): { fraction: number; beyond: boolean } {
  if (km > DSCAN_AXIS_KM) return { fraction: 1, beyond: true };
  return { fraction: Math.max(0, km) / DSCAN_AXIS_KM, beyond: false };
}
