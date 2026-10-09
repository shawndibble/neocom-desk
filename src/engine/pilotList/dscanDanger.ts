/**
 * The **Danger read** above a D-Scan: "am I in danger, and what should I watch
 * out for?" Where the Read-out (`dscanReadout`) describes the scan, this ranks
 * what on it can hurt, pin, find or reinforce a pilot flying a given ship.
 *
 * Wording stays a condition, never a verdict (decision 20260912-172628): the
 * module returns counts and kinds, the view turns them into sentences. The
 * numbers are starting values, named so they can be tuned on real scans.
 *
 * Pure: the SDE lookups come in as `infoOf` and `nameOf`.
 */
import { buildReadout, KILL_GANG_MIN, type Readout, type Tone } from './dscanReadout';
import { CAPITAL_GROUPS, roleOfType, type DscanTypeInfo } from './dscanRoles';
import type { HullCount } from './dscanWorth';
import type { DscanRow } from './parsePilotPaste';

export type DangerLevel = 'clear' | 'watch' | 'danger' | 'busy';
/** What a ship on the scan can do to you, most pressing first. */
export type ThreatKind = 'catch' | 'more' | 'kill' | 'find';

/** This many ships or more, with no doctrine and no cyno, read as a busy hub. */
export const BUSY_MIN_SHIPS = 30;
/** Ten damage ships that can hurt you are Danger on their own. */
export const DANGER_KILL_MIN = 10;
/** From this many ships the fleet-by-role bar moves up beside the answer. */
export const ROLE_BAR_PROMOTE_MIN = 12;
/** The watch list shows this many groups; the rest collapse behind "+N more". */
export const WATCH_MAX_GROUPS = 5;
/** A scan this old may no longer match what is on grid: the page says so. */
export const SCAN_STALE_MS = 2 * 60_000;
/** The shortest age the line states, so a scan just pasted never reads "0 seconds". */
const SCAN_AGE_FLOOR_S = 5;

export interface ScanAge {
  stale: boolean;
  unit: 'seconds' | 'minutes';
  value: number;
}

/** How old a scan is, in the unit the page words it in. */
export function scanAge(ageMs: number): ScanAge {
  const stale = ageMs >= SCAN_STALE_MS;
  if (!stale) {
    return { stale, unit: 'seconds', value: Math.max(SCAN_AGE_FLOOR_S, Math.floor(ageMs / 1000)) };
  }
  return { stale, unit: 'minutes', value: Math.floor(ageMs / 60_000) };
}

/** With no ship known, a damage ship threatens at this rank and up (cruiser). */
const UNKNOWN_SHIP_THRESHOLD = 3;

const BLACK_OPS_GROUP = 898;
const TACKLE_GROUPS = new Set([541, 894, 831]);
const MOBILE_WARP_DISRUPTOR_GROUP = 361;
const RECON_GROUPS = new Set([833, 906]);
const CYNO_BEACON_GROUP = 4093;
const COMBAT_PROBE = /^combat scanner probe/i;
const CYNO_FIELD = /^cynosural field\b(?! generator)/i;
const SHIP_ROLES = new Set(['capitals', 'industrial', 'transport', 'support', 'dps']);

/** Hull size, 1 (frigate) to 6 (capital), by SDE group. Pinned like the role groups. */
const RANK_BY_GROUP = new Map<number, number>([
  // Frigate, Rookie Ship, Assault Frigate, Interceptor, Covert Ops, Stealth Bomber,
  // Logistics Frigate, Expedition Frigate, Electronic Attack Ship.
  ...[25, 237, 324, 831, 830, 834, 1527, 1283, 893].map((g): [number, number] => [g, 1]),
  // Destroyer, Interdictor, Command Destroyer, Tactical Destroyer.
  ...[420, 541, 1534, 1305].map((g): [number, number] => [g, 2]),
  // Cruiser, HAC, Force Recon, Combat Recon, Logistics Cruiser, HIC, Strategic, Flag Cruiser.
  ...[26, 358, 833, 906, 832, 894, 963, 1972].map((g): [number, number] => [g, 3]),
  // Battlecruiser, Command Ship, Attack Battlecruiser.
  ...[419, 540, 1201].map((g): [number, number] => [g, 4]),
  // Battleship, Marauder, Black Ops.
  ...[27, 900, BLACK_OPS_GROUP].map((g): [number, number] => [g, 5]),
  ...[...CAPITAL_GROUPS].map((g): [number, number] => [g, 6]),
]);

export function hullRankOf(groupId: number): number | null {
  return RANK_BY_GROUP.get(groupId) ?? null;
}

/**
 * How big the pilot's own hull counts for. Industrial and transport hulls are
 * the most fragile whatever their size, so anything with guns threatens them.
 */
export function ownShipRank(groupId: number | null): number | null {
  if (groupId === null) return null;
  const role = roleOfType({ groupId, categoryId: 6 }, '');
  if (role === 'industrial' || role === 'transport') return 1;
  return hullRankOf(groupId);
}

/** The smallest damage-ship rank that can hurt a hull of rank `own`. */
export function killThresholdRank(own: number | null): number {
  if (own === null) return UNKNOWN_SHIP_THRESHOLD;
  return own <= 2 ? 1 : own - 1;
}

export interface WatchGroup {
  typeId: number;
  groupId: number;
  count: number;
  kind: ThreatKind;
  /** Hulls of this type new since the earlier scan; null when there is none to compare. */
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
  /** Ships on the scan, capsules and shuttles left out. */
  totalShips: number;
  /** Ships (and probes or cynos) that can do each thing to the pilot. */
  counts: Record<ThreatKind, number>;
  /** The sentence's clauses, most pressing first; empty when nothing here is a threat. */
  headline: HeadlineClause[];
  /** The Read-out's reading when it found a pattern (not "mixed"), else null. */
  pattern: Pick<Readout, 'reading' | 'confidence' | 'evidence'> | null;
  watch: WatchGroup[];
  /** Threat groups beyond the cap. */
  moreGroups: number;
  /** Groups and ships on the scan that are no threat. */
  notThreat: { groups: number; ships: number; typeIds: number[] };
  tripwires: Tripwire[];
  promoteRoles: boolean;
  /** False when the pilot's ship is unknown, so the kill count uses the cruiser-and-up rule. */
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
    const rank = hullRankOf(info.groupId) ?? 0;
    const capital = role === 'capitals';
    const blackOps = info.groupId === BLACK_OPS_GROUP;
    hulls.set(row.typeId, {
      typeId: row.typeId,
      groupId: info.groupId,
      count: 1,
      kill: capital || blackOps || (role === 'dps' && rank >= threshold),
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
        : { reading: readout.reading, confidence: readout.confidence, evidence: readout.evidence },
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
