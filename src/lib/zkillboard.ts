/**
 * Every zKillboard URL. zKillboard is a third-party site that lists a
 * pilot's, corporation's, or alliance's kills and losses — data the ESI
 * public-info endpoints do not carry, so the Public Info Modal links out
 * to it rather than trying to show it inline.
 *
 * Shaped after `eveImages.ts`: one named helper per entity kind, so the
 * path segments live in one place instead of as template strings in JSX.
 */
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import type { KillRecord, KillSpace } from '@/engine/pilotList/killActivity';
import type { RecentKill, RecentKillAttacker } from '@/engine/route/recentKills';

/**
 * A zKillboard link carries only the killmail id, but ESI's killmail endpoint
 * also wants the hash — which only zKillboard's API knows. `null` when the
 * kill isn't there or the request fails.
 */
export async function fetchKillmailHash(killmailId: number): Promise<string | null> {
  try {
    const response = await fetch(`https://zkillboard.com/api/killID/${killmailId}/`);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const hash = Array.isArray(body) ? (body[0] as { zkb?: { hash?: unknown } })?.zkb?.hash : null;
    return typeof hash === 'string' ? hash : null;
  } catch {
    return null;
  }
}

/** How many of a hull's most recent losses Popular fits reads. */
export const HULL_LOSS_LIMIT = 40;

/**
 * One loss from zKillboard's losses API. zKillboard sends either the whole
 * killmail inline (`victim`, `killmail_time`) or only `{killmail_id, zkb}`;
 * `victim`/`time` are null in the second case, for the caller to read from
 * ESI with the hash.
 */
export interface ZkillHullLoss {
  killmailId: number;
  hash: string;
  /** zKillboard's ISK estimate of the fit (else of the whole loss); null when absent. */
  value: number | null;
  time: string | null;
  victim: KillmailVictim | null;
}

/** `ok: false` when zKillboard failed or rate-limited, so "no losses" and "couldn't load" differ. */
export type HullLossesResult = { ok: true; losses: ZkillHullLoss[] } | { ok: false; losses: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseVictim(value: unknown): KillmailVictim | null {
  if (!isRecord(value) || typeof value.ship_type_id !== 'number') return null;
  return {
    ship_type_id: value.ship_type_id,
    items: Array.isArray(value.items) ? (value.items as KillmailVictim['items']) : [],
  };
}

/** Reads a losses-API body defensively: newest `limit` entries, malformed ones dropped. */
export function parseHullLosses(body: unknown, limit = HULL_LOSS_LIMIT): ZkillHullLoss[] {
  if (!Array.isArray(body)) return [];
  const losses: ZkillHullLoss[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_id !== 'number') continue;
    const zkb = isRecord(entry.zkb) ? entry.zkb : null;
    if (typeof zkb?.hash !== 'string') continue;
    losses.push({
      killmailId: entry.killmail_id,
      hash: zkb.hash,
      value: finiteOrNull(zkb.fittedValue) ?? finiteOrNull(zkb.totalValue),
      time: typeof entry.killmail_time === 'string' ? entry.killmail_time : null,
      victim: parseVictim(entry.victim),
    });
  }
  return losses.sort((a, b) => b.killmailId - a.killmailId).slice(0, limit);
}

/**
 * A hull's most recent losses, for Popular fits. A browser fetch with no
 * custom headers, as `fetchKillmailHash` (scope decision `20260924-195833`).
 */
export async function fetchHullLosses(shipTypeId: number): Promise<HullLossesResult> {
  try {
    const response = await fetch(`https://zkillboard.com/api/losses/shipTypeID/${shipTypeId}/`);
    if (!response.ok) return { ok: false, losses: [] };
    return { ok: true, losses: parseHullLosses(await response.json()) };
  } catch {
    return { ok: false, losses: [] };
  }
}

/** How many of a pilot's most-used hulls Pilot Lookup lists. */
export const PILOT_TOP_SHIPS = 5;

/** How long a pilot's zKillboard stats are reused before asking again. */
export const PILOT_STATS_CACHE_MS = 10 * 60_000;

/** One hull from zKillboard's all-time "ships used on kills" list. */
export interface PilotTopShip {
  shipTypeId: number;
  kills: number;
}

/**
 * A pilot's zKillboard totals, as stated. `iskEfficiency` is
 * destroyed / (destroyed + lost), null when no ISK moved either way; the two
 * ratios are zKillboard's own 0-100 figures, null when it sends none.
 */
export interface PilotStats {
  kills: number;
  losses: number;
  iskDestroyed: number;
  iskLost: number;
  iskEfficiency: number | null;
  soloKills: number;
  dangerRatio: number | null;
  gangRatio: number | null;
  topShips: PilotTopShip[];
  /** The pilots zKillboard counts in a corporation or alliance; null for a pilot, or when unstated. */
  memberCount: number | null;
}

/** What zKillboard knows of a pilot: their stats, or that it has no kill or loss for them. */
export type PilotStatsParse = { kind: 'stats'; stats: PilotStats } | { kind: 'no-history' };

/** `failed` when the request failed or the body was unreadable — never cached. */
export type PilotStatsResult = PilotStatsParse | { kind: 'failed' };

function countOrZero(value: unknown): number {
  return finiteOrNull(value) ?? 0;
}

function parseTopShips(topAllTime: unknown): PilotTopShip[] {
  if (!Array.isArray(topAllTime)) return [];
  const bucket: unknown = topAllTime.find((entry) => isRecord(entry) && entry.type === 'ship');
  if (!isRecord(bucket) || !Array.isArray(bucket.data)) return [];
  const ships: PilotTopShip[] = [];
  for (const entry of bucket.data) {
    if (!isRecord(entry) || typeof entry.shipTypeID !== 'number') continue;
    const kills = finiteOrNull(entry.kills);
    if (kills === null) continue;
    ships.push({ shipTypeId: entry.shipTypeID, kills });
  }
  return ships.slice(0, PILOT_TOP_SHIPS);
}

/** zKillboard's answer for an id it has never recorded a kill or loss for. */
const UNKNOWN_ID_ERROR = 'Invalid type or id';

/**
 * Reads a `/api/stats/characterID/{id}/` body defensively. zKillboard answers
 * an id it has never seen with a 200 `{"error": "Invalid type or id"}`, and a
 * pilot with no kill or loss with a body that carries no counts — both are
 * "no history", distinct from a failure. zKillboard leaves a zero count out
 * of the body, so a missing count reads as 0. `null` (a failure) for any
 * other error body, and for a body that is not an object at all.
 */
export function parsePilotStats(body: unknown): PilotStatsParse | null {
  if (!isRecord(body) || Array.isArray(body)) return null;
  if (body.error !== undefined) {
    return body.error === UNKNOWN_ID_ERROR ? { kind: 'no-history' } : null;
  }
  const kills = countOrZero(body.shipsDestroyed);
  const losses = countOrZero(body.shipsLost);
  if (kills === 0 && losses === 0) return { kind: 'no-history' };
  const iskDestroyed = countOrZero(body.iskDestroyed);
  const iskLost = countOrZero(body.iskLost);
  const iskMoved = iskDestroyed + iskLost;
  return {
    kind: 'stats',
    stats: {
      kills,
      losses,
      iskDestroyed,
      iskLost,
      iskEfficiency: iskMoved > 0 ? iskDestroyed / iskMoved : null,
      soloKills: countOrZero(body.soloKills),
      dangerRatio: finiteOrNull(body.dangerRatio),
      gangRatio: finiteOrNull(body.gangRatio),
      topShips: parseTopShips(body.topAllTime),
      memberCount: isRecord(body.info) ? finiteOrNull(body.info.memberCount) : null,
    },
  };
}

type StatsEntity = 'characterID' | 'corporationID' | 'allianceID';

/** Keyed `kind:id`: a pilot, a corporation and an alliance can never share an answer. */
const pilotStatsCache = new Map<string, { at: number; value: PilotStatsParse }>();

/** Test seam: forget every cached pilot and corporation. */
export function resetPilotStatsCache(): void {
  pilotStatsCache.clear();
}

/**
 * zKillboard's stats for a pilot or a corporation — one body shape for both,
 * so `parsePilotStats` reads either. A browser fetch with no custom headers,
 * as `fetchKillmailHash` (scope decision `20260924-195833`). The URL 302s to
 * `.../kills/`; both legs are CORS-open, so the fetch follows it. Answers are
 * reused for `PILOT_STATS_CACHE_MS`; a failure never is.
 */
async function fetchEntityStats(entity: StatsEntity, id: number): Promise<PilotStatsResult> {
  const key = `${entity}:${id}`;
  const cached = pilotStatsCache.get(key);
  if (cached && Date.now() - cached.at < PILOT_STATS_CACHE_MS) return cached.value;
  try {
    const response = await fetch(`https://zkillboard.com/api/stats/${entity}/${id}/`);
    if (!response.ok) return { kind: 'failed' };
    const parsed = parsePilotStats(await response.json());
    if (parsed === null) return { kind: 'failed' };
    pilotStatsCache.set(key, { at: Date.now(), value: parsed });
    return parsed;
  } catch {
    return { kind: 'failed' };
  }
}

/** A pilot's zKillboard stats, for Pilot Lookup and the Show Info Character tab. */
export function fetchPilotStats(characterId: number): Promise<PilotStatsResult> {
  return fetchEntityStats('characterID', characterId);
}

/** An alliance's zKillboard stats, for the Show Info Alliance tab. */
export function fetchAllianceStats(allianceId: number): Promise<PilotStatsResult> {
  return fetchEntityStats('allianceID', allianceId);
}

/** A corporation's zKillboard stats, for the Show Info Corporation tab. */
export function fetchCorporationStats(corporationId: number): Promise<PilotStatsResult> {
  return fetchEntityStats('corporationID', corporationId);
}

/** How many of a pilot's most recent kills and losses Pilot Lookup lists. */
export const PILOT_KILLMAIL_LIMIT = 25;

/** Who was on one side of a killmail; any part null when the killmail doesn't say (an NPC, a structure). */
export interface KillmailParty {
  characterId: number | null;
  corporationId: number | null;
  shipTypeId: number | null;
}

/** What a killmail body states: from zKillboard's inline entry or ESI's killmail, same shape. */
export interface KillmailDetail {
  time: string | null;
  systemId: number | null;
  victim: KillmailVictim;
  victimParty: KillmailParty;
  /** The final-blow attacker (else the first listed); null when none is listed. */
  finalBlow: KillmailParty | null;
}

/** One of a pilot's kills or losses. `detail` is null for zKillboard's hash-only shape. */
export interface PilotKillmail {
  killmailId: number;
  hash: string;
  side: 'kill' | 'loss';
  /** zKillboard's total value of the loss; null when absent. */
  value: number | null;
  detail: KillmailDetail | null;
}

export type PilotKillmailsResult = { ok: true; entries: PilotKillmail[] } | { ok: false };

function readParty(value: Record<string, unknown>): KillmailParty {
  return {
    characterId: finiteOrNull(value.character_id),
    corporationId: finiteOrNull(value.corporation_id),
    shipTypeId: finiteOrNull(value.ship_type_id),
  };
}

/** Reads a killmail body (zKillboard inline or ESI) defensively; null without a readable victim. */
export function readKillmailDetail(body: unknown): KillmailDetail | null {
  if (!isRecord(body) || !isRecord(body.victim)) return null;
  const victim = parseVictim(body.victim);
  if (victim === null) return null;
  const attackers = Array.isArray(body.attackers) ? body.attackers.filter(isRecord) : [];
  const finalBlow = attackers.find((attacker) => attacker.final_blow === true) ?? attackers[0];
  return {
    time: typeof body.killmail_time === 'string' ? body.killmail_time : null,
    systemId: finiteOrNull(body.solar_system_id),
    victim,
    victimParty: readParty(body.victim),
    finalBlow: finalBlow === undefined ? null : readParty(finalBlow),
  };
}

/** Reads a `kills/` or `losses/characterID` body defensively; entries without an id or hash are dropped. */
export function parsePilotKillmails(body: unknown, side: PilotKillmail['side']): PilotKillmail[] {
  if (!Array.isArray(body)) return [];
  const entries: PilotKillmail[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_id !== 'number') continue;
    const zkb = isRecord(entry.zkb) ? entry.zkb : null;
    if (typeof zkb?.hash !== 'string') continue;
    entries.push({
      killmailId: entry.killmail_id,
      hash: zkb.hash,
      side,
      value: finiteOrNull(zkb.totalValue),
      detail: readKillmailDetail(entry),
    });
  }
  return entries;
}

const pilotKillmailsCache = new Map<number, { at: number; entries: PilotKillmail[] }>();

/** Test seam: forget every cached pilot's kills and losses. */
export function resetPilotKillmailsCache(): void {
  pilotKillmailsCache.clear();
}

async function fetchPilotSide(
  characterId: number,
  side: PilotKillmail['side']
): Promise<PilotKillmail[] | null> {
  const path = side === 'kill' ? 'kills' : 'losses';
  const response = await fetch(`https://zkillboard.com/api/${path}/characterID/${characterId}/`);
  if (!response.ok) return null;
  return parsePilotKillmails(await response.json(), side);
}

/**
 * A pilot's most recent kills and losses, merged newest first (killmail ids
 * rise with time), for Pilot Lookup. A browser fetch with no custom headers,
 * as `fetchKillmailHash` (scope decision `20260924-195833`). Either list
 * failing fails the whole answer — kills alone would misstate the record.
 * Answers are reused for `PILOT_STATS_CACHE_MS`; a failure never is.
 */
export async function fetchPilotKillmails(characterId: number): Promise<PilotKillmailsResult> {
  const cached = pilotKillmailsCache.get(characterId);
  if (cached && Date.now() - cached.at < PILOT_STATS_CACHE_MS) {
    return { ok: true, entries: cached.entries };
  }
  try {
    const [kills, losses] = await Promise.all([
      fetchPilotSide(characterId, 'kill'),
      fetchPilotSide(characterId, 'loss'),
    ]);
    if (kills === null || losses === null) return { ok: false };
    const entries = [...kills, ...losses]
      .sort((a, b) => b.killmailId - a.killmailId)
      .slice(0, PILOT_KILLMAIL_LIMIT);
    pilotKillmailsCache.set(characterId, { at: Date.now(), entries });
    return { ok: true, entries };
  } catch {
    return { ok: false };
  }
}

const SPACE_BY_LABEL: Record<string, KillSpace> = {
  'loc:highsec': 'highsec',
  'loc:lowsec': 'lowsec',
  'loc:nullsec': 'nullsec',
  'loc:w-space': 'wormhole',
};

/**
 * Reads a `kills/characterID` body into the pilot's kill history: when, in
 * what kind of space (zKillboard's `loc:` label), the hull that died and the
 * hull this pilot flew. An entry with no readable time is dropped.
 */
export function parseKillHistory(body: unknown, characterId: number): KillRecord[] {
  if (!Array.isArray(body)) return [];
  const kills: KillRecord[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_time !== 'string') continue;
    const timeMs = Date.parse(entry.killmail_time);
    if (!Number.isFinite(timeMs)) continue;
    const labels = isRecord(entry.zkb) && Array.isArray(entry.zkb.labels) ? entry.zkb.labels : [];
    const spaceLabel = labels.find(
      (label): label is string => typeof label === 'string' && label in SPACE_BY_LABEL
    );
    const own = Array.isArray(entry.attackers)
      ? entry.attackers.find((a) => isRecord(a) && a.character_id === characterId)
      : undefined;
    kills.push({
      timeMs,
      space: spaceLabel === undefined ? null : SPACE_BY_LABEL[spaceLabel],
      systemId: finiteOrNull(entry.solar_system_id),
      victimShipTypeId: isRecord(entry.victim) ? finiteOrNull(entry.victim.ship_type_id) : null,
      ownShipTypeId: isRecord(own) ? finiteOrNull(own.ship_type_id) : null,
    });
  }
  return kills;
}

export type PilotKillHistoryResult = { ok: true; kills: KillRecord[] } | { ok: false };

const pilotKillHistoryCache = new Map<number, { at: number; kills: KillRecord[] }>();

/** Test seam: forget every cached kill history. */
export function resetPilotKillHistoryCache(): void {
  pilotKillHistoryCache.clear();
}

/**
 * A pilot's latest kills (zKillboard's first page, newest first; up to 200),
 * one request, for the Local list's per-space columns and the modal's chart.
 * Kills only: losses say little about how dangerous a pilot is. A browser
 * fetch with no custom headers, as `fetchKillmailHash` (decision
 * `20260924-195833`). Reused for `PILOT_STATS_CACHE_MS`; a failure never is.
 */
export async function fetchPilotKillHistory(characterId: number): Promise<PilotKillHistoryResult> {
  const cached = pilotKillHistoryCache.get(characterId);
  if (cached && Date.now() - cached.at < PILOT_STATS_CACHE_MS) {
    return { ok: true, kills: cached.kills };
  }
  try {
    const response = await fetch(`https://zkillboard.com/api/kills/characterID/${characterId}/`);
    if (!response.ok) return { ok: false };
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return { ok: false };
    const kills = parseKillHistory(body, characterId);
    pilotKillHistoryCache.set(characterId, { at: Date.now(), kills });
    return { ok: true, kills };
  } catch {
    return { ok: false };
  }
}

/** `ok: false` when zKillboard failed or rate-limited, so "no kills" and "couldn't load" differ. */
export type SystemRecentKillsResult = { ok: true; kills: RecentKill[] } | { ok: false };

function parseAttacker(value: unknown): RecentKillAttacker | null {
  if (!isRecord(value)) return null;
  const attacker: RecentKillAttacker = {};
  if (typeof value.ship_type_id === 'number') attacker.shipTypeId = value.ship_type_id;
  if (typeof value.weapon_type_id === 'number') attacker.weaponTypeId = value.weapon_type_id;
  return attacker;
}

/** One killmail entry as a `RecentKill`; `null` for an NPC kill or one with no id or readable time. */
function parseRecentKill(entry: unknown): RecentKill | null {
  if (!isRecord(entry) || typeof entry.killmail_id !== 'number') return null;
  const time = typeof entry.killmail_time === 'string' ? Date.parse(entry.killmail_time) : NaN;
  if (!Number.isFinite(time)) return null;
  const zkb = isRecord(entry.zkb) ? entry.zkb : {};
  if (zkb.npc === true) return null;
  return {
    killmailId: entry.killmail_id,
    time,
    locationId: finiteOrNull(zkb.locationID),
    attackers: Array.isArray(entry.attackers)
      ? entry.attackers.flatMap((attacker) => parseAttacker(attacker) ?? [])
      : [],
  };
}

/**
 * Reads a `kills/systemID` body defensively (issue #2329). zKillboard sends
 * the killmail inline; an entry without an id or a readable time is dropped,
 * and so is every NPC kill (`zkb.npc`) — Route Safety counts player kills.
 */
export function parseSystemKills(body: unknown): RecentKill[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((entry) => parseRecentKill(entry) ?? []);
}

/** Reads a `kills/regionID` body as `parseSystemKills` does, grouped by `solar_system_id`. */
export function parseRegionKills(body: unknown): Map<number, RecentKill[]> {
  const bySystem = new Map<number, RecentKill[]>();
  if (!Array.isArray(body)) return bySystem;
  for (const entry of body) {
    const kill = parseRecentKill(entry);
    const systemId = isRecord(entry) ? finiteOrNull(entry.solar_system_id) : null;
    if (kill === null || systemId === null) continue;
    const kills = bySystem.get(systemId);
    if (kills) kills.push(kill);
    else bySystem.set(systemId, [kill]);
  }
  return bySystem;
}

/**
 * A solar system's player kills from the last hour, for Route Safety. A
 * browser fetch with no custom headers, as `fetchKillmailHash` (scope
 * decision `20260924-195833`).
 */
export async function fetchSystemRecentKills(systemId: number): Promise<SystemRecentKillsResult> {
  try {
    const response = await fetch(
      `https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`
    );
    if (!response.ok) return { ok: false };
    return { ok: true, kills: parseSystemKills(await response.json()) };
  } catch {
    return { ok: false };
  }
}

/** zKillboard's page size: a page with this many entries may have a next page. */
export const REGION_PAGE_SIZE = 1000;

/** A backstop on paging, far above any real hour (a page holds 1,000 kills). */
const REGION_MAX_PAGES = 10;

/** `ok: false` when zKillboard failed or rate-limited, so "no kills" and "couldn't load" differ. */
export type RegionRecentKillsResult =
  { ok: true; bySystem: ReadonlyMap<number, RecentKill[]> } | { ok: false };

/**
 * A region's player kills from the last hour, grouped by system, for Route
 * Safety: one request covers every route system in the region, where the
 * system API needs one each (zKillboard no longer takes comma-separated ids).
 * Follows `/page/n/` while a page is full, so a busy region is never cut at
 * 1,000 kills; any page failing, or the page cap being hit, fails the whole answer. A browser fetch with
 * no custom headers, as `fetchKillmailHash`.
 */
export async function fetchRegionRecentKills(regionId: number): Promise<RegionRecentKillsResult> {
  const bySystem = new Map<number, RecentKill[]>();
  // New kills shift the pages while they are read, so one can show on two.
  const seen = new Set<number>();
  try {
    for (let pageNumber = 1; pageNumber <= REGION_MAX_PAGES; pageNumber += 1) {
      const suffix = pageNumber === 1 ? '' : `page/${pageNumber}/`;
      const response = await fetch(
        `https://zkillboard.com/api/kills/regionID/${regionId}/pastSeconds/3600/${suffix}`
      );
      if (!response.ok) return { ok: false };
      const body: unknown = await response.json();
      // An error body is a failure, not an empty hour.
      if (!Array.isArray(body)) return { ok: false };
      for (const [systemId, kills] of parseRegionKills(body)) {
        const fresh = kills.filter((kill) => !seen.has(kill.killmailId));
        for (const kill of fresh) seen.add(kill.killmailId);
        const known = bySystem.get(systemId);
        if (known) known.push(...fresh);
        else bySystem.set(systemId, fresh);
      }
      if (body.length < REGION_PAGE_SIZE) return { ok: true, bySystem };
    }
    // Still full at the page cap: a partial hour would read as quiet.
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export function systemZkillUrl(systemId: number): string {
  return `https://zkillboard.com/system/${systemId}/`;
}

export function characterZkillUrl(characterId: number): string {
  return `https://zkillboard.com/character/${characterId}/`;
}

export function corporationZkillUrl(corporationId: number): string {
  return `https://zkillboard.com/corporation/${corporationId}/`;
}

export function allianceZkillUrl(allianceId: number): string {
  return `https://zkillboard.com/alliance/${allianceId}/`;
}
