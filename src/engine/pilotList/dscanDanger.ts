import { buildReadout, KILL_GANG_MIN, type Readout, type Tone } from './dscanReadout';
import { CAPITAL_GROUPS, roleOfType, type DscanTypeInfo } from './dscanRoles';
import type { HullCount } from './dscanWorth';
import type { DscanRow } from './parsePilotPaste';
import { MINUTE_MS } from '@/lib/age';

export type DangerLevel = 'clear' | 'watch' | 'danger' | 'busy';
export type ThreatKind = 'catch' | 'more' | 'kill' | 'find';

export const BUSY_MIN_SHIPS = 30;
export const DANGER_KILL_MIN = 10;
export const ROLE_BAR_PROMOTE_MIN = 12;
export const WATCH_MAX_GROUPS = 5;
export const SCAN_STALE_MS = 2 * MINUTE_MS;
const SCAN_AGE_FLOOR_S = 5;

export interface ScanAge {
  stale: boolean;
  unit: 'seconds' | 'minutes';
  value: number;
}

export function scanAge(ageMs: number): ScanAge {
  const stale = ageMs >= SCAN_STALE_MS;
  if (!stale) {
    return { stale, unit: 'seconds', value: Math.max(SCAN_AGE_FLOOR_S, Math.floor(ageMs / 1000)) };
  }
  return { stale, unit: 'minutes', value: Math.floor(ageMs / MINUTE_MS) };
}

const UNKNOWN_SHIP_THRESHOLD = 3;

const BLACK_OPS_GROUP = 898;
const TACKLE_GROUPS = new Set([541, 894, 831]);
const MOBILE_WARP_DISRUPTOR_GROUP = 361;
const RECON_GROUPS = new Set([833, 906]);
const CYNO_BEACON_GROUP = 4093;
const COMBAT_PROBE = /^combat scanner probe/i;
const CYNO_FIELD = /^cynosural field\b(?! generator)/i;
const SHIP_ROLES = new Set(['capitals', 'industrial', 'transport', 'support', 'dps']);

const RANK_BY_GROUP = new Map<number, number>([
  ...[25, 237, 324, 831, 830, 834, 1527, 1283, 893].map((g): [number, number] => [g, 1]),
  ...[420, 541, 1534, 1305].map((g): [number, number] => [g, 2]),
  ...[26, 358, 833, 906, 832, 894, 963, 1972].map((g): [number, number] => [g, 3]),
  ...[419, 540, 1201].map((g): [number, number] => [g, 4]),
  ...[27, 900, BLACK_OPS_GROUP].map((g): [number, number] => [g, 5]),
  ...[...CAPITAL_GROUPS].map((g): [number, number] => [g, 6]),
]);

export function hullRankOf(groupId: number): number | null {
  return RANK_BY_GROUP.get(groupId) ?? null;
}

export function ownShipRank(groupId: number | null): number | null {
  if (groupId === null) return null;
  const role = roleOfType({ groupId, categoryId: 6 }, '');
  if (role === 'industrial' || role === 'transport') return 1;
  return hullRankOf(groupId);
}

export function killThresholdRank(own: number | null): number {
  if (own === null) return UNKNOWN_SHIP_THRESHOLD;
  return own <= 2 ? 1 : own - 1;
}

export interface WatchGroup {
  typeId: number;
  groupId: number;
  count: number;
  kind: ThreatKind;
  newCount: number | null;
}

export interface Tripwire {
  kind: ThreatKind;
  count: number;
  tone: Tone;
}

export interface HeadlineClause {
  kind: ThreatKind;
  count: number;
}

export interface DangerRead {
  level: DangerLevel;
  totalShips: number;
  counts: Record<ThreatKind, number>;
  headline: HeadlineClause[];
  pattern: Pick<Readout, 'reading' | 'evidence'> | null;
  watch: WatchGroup[];
  moreGroups: number;
  notThreat: { groups: number; ships: number; typeIds: number[] };
  tripwires: Tripwire[];
  promoteRoles: boolean;
  ownShipKnown: boolean;
}

const TIER: Record<ThreatKind, number> = { catch: 5, more: 4, kill: 3, find: 1 };
const KIND_ORDER: readonly ThreatKind[] = ['kill', 'catch', 'more', 'find'];

interface Hull {
  typeId: number;
  groupId: number;
  count: number;
  kill: boolean;
  catch: boolean;
  more: boolean;
  find: boolean;
}

export function buildDangerRead(
  rows: readonly DscanRow[],
  infoOf: (typeId: number) => DscanTypeInfo | undefined,
  nameOf: (typeId: number) => string,
  opts: { ownShipGroupId: number | null; previous: readonly HullCount[] | null }
): DangerRead | null {
  const threshold = killThresholdRank(ownShipRank(opts.ownShipGroupId));
  const hulls = new Map<number, Hull>();
  let probes = 0;
  let cynos = 0;
  let disruptors = 0;
  let totalShips = 0;
  for (const row of rows) {
    const info = infoOf(row.typeId);
    if (COMBAT_PROBE.test(row.typeName)) probes += 1;
    if (CYNO_FIELD.test(row.typeName) || info?.groupId === CYNO_BEACON_GROUP) cynos += 1;
    if (info?.groupId === MOBILE_WARP_DISRUPTOR_GROUP) disruptors += 1;
    const role = roleOfType(info, row.typeName);
    if (role === null || info === undefined || !SHIP_ROLES.has(role)) continue;
    totalShips += 1;
    const known = hulls.get(row.typeId);
    if (known !== undefined) {
      known.count += 1;
      continue;
    }
    const rank = hullRankOf(info.groupId);
    const capital = role === 'capitals';
    const blackOps = info.groupId === BLACK_OPS_GROUP;
    hulls.set(row.typeId, {
      typeId: row.typeId,
      groupId: info.groupId,
      count: 1,
      kill: capital || blackOps || (role === 'dps' && (rank === null || rank >= threshold)),
      catch: TACKLE_GROUPS.has(info.groupId),
      more: capital || blackOps,
      find: RECON_GROUPS.has(info.groupId),
    });
  }
  if (totalShips === 0) return null;

  const counts: Record<ThreatKind, number> = {
    kill: 0,
    catch: disruptors,
    find: probes,
    more: cynos,
  };
  for (const h of hulls.values()) {
    for (const kind of KIND_ORDER) if (h[kind]) counts[kind] += h.count;
  }

  const readout = buildReadout(rows, infoOf, nameOf);
  const reading = readout?.reading ?? 'mixed';
  let level: DangerLevel;
  if (reading === 'mixed' && totalShips >= BUSY_MIN_SHIPS) level = 'busy';
  else if (KIND_ORDER.every((k) => counts[k] === 0)) level = 'clear';
  else if (
    reading === 'drop' ||
    reading === 'gang' ||
    (counts.catch > 0 && counts.kill > 0) ||
    (counts.more > 0 && counts.kill > 0) ||
    counts.kill >= DANGER_KILL_MIN
  ) {
    level = 'danger';
  } else {
    level = 'watch';
  }

  const previous = new Map<number, number>();
  for (const { typeId, count } of opts.previous ?? []) {
    previous.set(typeId, (previous.get(typeId) ?? 0) + count);
  }
  const threats: WatchGroup[] = [];
  let calmShips = 0;
  const calm: Hull[] = [];
  for (const h of hulls.values()) {
    const kind = KIND_ORDER.filter((k) => h[k]).sort((a, b) => TIER[b] - TIER[a])[0];
    if (kind === undefined) {
      calm.push(h);
      calmShips += h.count;
      continue;
    }
    threats.push({
      typeId: h.typeId,
      groupId: h.groupId,
      count: h.count,
      kind,
      newCount:
        opts.previous === null ? null : Math.max(0, h.count - (previous.get(h.typeId) ?? 0)),
    });
  }
  threats.sort((a, b) => TIER[b.kind] - TIER[a.kind] || b.count - a.count || a.typeId - b.typeId);

  const tone = (kind: ThreatKind, n: number): Tone => {
    if (n === 0) return 'none';
    if (kind === 'find') return 'warn';
    if (kind === 'kill') return n >= KILL_GANG_MIN ? 'bad' : 'warn';
    return 'bad';
  };
  const tripwireOrder: readonly ThreatKind[] = ['catch', 'more', 'kill', 'find'];

  return {
    level,
    totalShips,
    counts,
    headline: KIND_ORDER.filter((k) => counts[k] > 0).map((kind) => ({
      kind,
      count: counts[kind],
    })),
    pattern:
      readout === null || readout.reading === 'mixed'
        ? null
        : { reading: readout.reading, evidence: readout.evidence },
    watch: threats.slice(0, WATCH_MAX_GROUPS),
    moreGroups: Math.max(0, threats.length - WATCH_MAX_GROUPS),
    notThreat: {
      groups: calm.length,
      ships: calmShips,
      typeIds: calm.sort((a, b) => b.count - a.count || a.typeId - b.typeId).map((h) => h.typeId),
    },
    tripwires: tripwireOrder.map((kind) => ({
      kind,
      count: counts[kind],
      tone: tone(kind, counts[kind]),
    })),
    promoteRoles: totalShips >= ROLE_BAR_PROMOTE_MIN,
    ownShipKnown: ownShipRank(opts.ownShipGroupId) !== null,
  };
}
