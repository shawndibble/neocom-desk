import type { DscanRow } from './parsePilotPaste';

export type DscanRole =
  'capitals' | 'industrial' | 'transport' | 'support' | 'dps' | 'drones' | 'structures';

export interface DscanTypeInfo {
  typeId?: number;
  groupId: number;
  categoryId: number;
}

export interface FleetHull {
  typeId: number;
  groupId: number | null;
  count: number;
  minKm: number | null;
  maxKm: number | null;
  nameHint: { name: string; count: number } | null;
}

export interface FleetRole {
  role: DscanRole;
  total: number;
  percent: number;
  hulls: FleetHull[];
  distancesKm: number[];
}

export interface FleetBoard {
  roles: FleetRole[];
  counted: number;
  leftOut: number;
}

export const DSCAN_AXIS_KM = 150;

const SHIP_CATEGORY = 6;
const DRONE_CATEGORIES = new Set([18, 87, 22]);
const STRUCTURE_CATEGORIES = new Set([65, 23]);

export const CAPITAL_GROUPS: ReadonlySet<number> = new Set([547, 485, 659, 30, 1538, 4594]);
const INDUSTRIAL_GROUPS = new Set([543, 463, 941, 883, 1283, 4902]);
const ORE_HULL_TYPES = new Set([32880, 89648, 89240, 89647, 91174, 89649]);
const TRANSPORT_GROUPS = new Set([28, 380, 1202, 513, 902]);
const SUPPORT_GROUPS = new Set([832, 1527, 540, 1534, 833, 906, 541, 894, 893, 898, 830]);
const STRUCTURE_GROUPS = new Set([1025]);
const NOT_A_FLEET_GROUPS = new Set([29, 31, 1022, 5087]);

const ORDER: readonly DscanRole[] = [
  'capitals',
  'industrial',
  'transport',
  'support',
  'dps',
  'drones',
  'structures',
];

export function roleOfType(info: DscanTypeInfo | undefined, typeName: string): DscanRole | null {
  if (info === undefined) return /\bwreck$/i.test(typeName.trim()) ? 'structures' : null;
  const { typeId, groupId, categoryId } = info;
  if (typeId !== undefined && ORE_HULL_TYPES.has(typeId)) return 'industrial';
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

export function laneOffset(km: number): { fraction: number; beyond: boolean } {
  if (km > DSCAN_AXIS_KM) return { fraction: 1, beyond: true };
  return { fraction: Math.max(0, km) / DSCAN_AXIS_KM, beyond: false };
}
