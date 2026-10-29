/**
 * Every zKillboard URL. zKillboard is a third-party site that lists a
 * pilot's, corporation's, or alliance's kills and losses — data the ESI
 * public-info endpoints do not carry, so the Public Info Modal links out
 * to it rather than trying to show it inline.
 *
 * Shaped after `eveImages.ts`: one named helper per entity kind, so the
 * path segments live in one place instead of as template strings in JSX.
 */
import type { KillmailHashLookup } from '@/engine/fittings/load';
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { createTtlCache } from '@/lib/ttlCache';
import type { KillRecord, KillSpace } from '@/engine/pilotList/killActivity';
import type { RecentKill, RecentKillAttacker } from '@/engine/route/recentKills';
import { isRecord } from '@/engine/guards';
import { MINUTE_MS } from '@/lib/age';

/**
 * Why a zKillboard request failed: no answer (`offline`, a thrown fetch or a
 * timeout), HTTP 429 (`rate-limited`), any other error status (`http`), or an
 * answer that was not the expected JSON (`parse`).
 */
export type ZkillFailureReason = 'offline' | 'rate-limited' | 'http' | 'parse';

type ZkillJson =
  { ok: true; body: unknown } | { ok: false; reason: ZkillFailureReason; status: number | null };

/** One zKillboard GET, parsed. Never throws; no custom headers (scope decision `20260924-195833`). */
async function zkillJson(url: string): Promise<ZkillJson> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch {
    return { ok: false, reason: 'offline', status: null };
  }
  if (response.status === 429) return { ok: false, reason: 'rate-limited', status: 429 };
  if (!response.ok) return { ok: false, reason: 'http', status: response.status };
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, reason: 'parse', status: null };
  }
}

/**
 * Why each shared-cache load last failed, keyed `cache:key`. The caches carry
 * only a value or null, so a failure's cause is kept here; failures are still
 * never cached. Read after a cache `get` returns null.
 */
const failureReasons = new Map<string, ZkillFailureReason>();

/** Records a load's outcome: clears the key on success, notes the reason on failure. */
function settle<T>(key: string, value: T | null, reason: ZkillFailureReason): T | null {
  failureReasons.delete(key);
  if (value === null) {
    failureReasons.set(key, reason);
    if (failureReasons.size > FAILURE_REASONS_MAX) {
      const oldest = failureReasons.keys().next().value;
      if (oldest !== undefined) failureReasons.delete(oldest);
    }
  }
  return value;
}

/** Keeps the map bounded: the oldest note goes first. */
const FAILURE_REASONS_MAX = 200;

/** Runs a cache loader; a throw is recorded as a failure rather than leaving a stale reason. */
async function guarded<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return settle(key, null, 'parse');
  }
}

function failureReason(key: string): ZkillFailureReason {
  return failureReasons.get(key) ?? 'http';
}

/**
 * A zKillboard link carries only the killmail id, but ESI's killmail endpoint
 * also wants the hash — which only zKillboard's API knows. `not-found` when
 * zKillboard answers and has no such kill (a 404, or an empty list);
 * `unreachable` when it can't be asked at all (offline, a timeout, an error
 * status, an unreadable body), which says nothing about the kill.
 */
export async function fetchKillmailHash(killmailId: number): Promise<KillmailHashLookup> {
  const result = await zkillJson(`https://zkillboard.com/api/killID/${killmailId}/`);
  if (!result.ok) return { status: result.status === 404 ? 'not-found' : 'unreachable' };
  const { body } = result;
  const hash = Array.isArray(body) ? (body[0] as { zkb?: { hash?: unknown } })?.zkb?.hash : null;
  return typeof hash === 'string' ? { status: 'ok', hash } : { status: 'not-found' };
}

/** How many of a hull's most recent losses Popular fits reads. */
const HULL_LOSS_LIMIT = 40;

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
export type HullLossesResult =
  { ok: true; losses: ZkillHullLoss[] } | { ok: false; losses: []; reason: ZkillFailureReason };

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

/** Concurrent callers for one hull share one request; nothing is reused once it settles. */
const hullLossesInflight = createTtlCache<ZkillHullLoss[]>({ ttlMs: 0, max: 50 });

/**
 * A hull's most recent losses, for Popular fits. A browser fetch with no
 * custom headers, as `fetchKillmailHash` (scope decision `20260924-195833`).
 */
export async function fetchHullLosses(shipTypeId: number): Promise<HullLossesResult> {
  const key = `hull:${shipTypeId}`;
  const losses = await hullLossesInflight.get(String(shipTypeId), () =>
    guarded(key, async () => {
      const result = await zkillJson(`https://zkillboard.com/api/losses/shipTypeID/${shipTypeId}/`);
      if (!result.ok) return settle(key, null, result.reason);
      return settle(key, Array.isArray(result.body) ? parseHullLosses(result.body) : null, 'parse');
    })
  );
  return losses === null
    ? { ok: false, losses: [], reason: failureReason(key) }
    : { ok: true, losses };
}

/** How many of a pilot's most-used hulls Pilot Lookup lists. */
export const PILOT_TOP_SHIPS = 5;

/** How long a pilot's zKillboard stats are reused before asking again. */
export const PILOT_STATS_CACHE_MS = 10 * MINUTE_MS;

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
export type PilotStatsResult = PilotStatsParse | { kind: 'failed'; reason: ZkillFailureReason };

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

/**
 * Lists kept at once. Each holds up to 200 full killmail bodies, so a long Local
 * list must not pin them all for the session: the oldest go first.
 */
const PILOT_LIST_CACHE_MAX = 120;

/** Keyed `kind:id`: a pilot, a corporation and an alliance can never share an answer. */
const pilotStatsCache = createTtlCache<PilotStatsParse>({
  ttlMs: PILOT_STATS_CACHE_MS,
  max: 500,
});

/** Test seam: forget every cached pilot and corporation. */
export function resetPilotStatsCache(): void {
  pilotStatsCache.clear();
  statsFetchedAt.clear();
  failureReasons.clear();
}

/**
 * zKillboard's stats for a pilot or a corporation — one body shape for both,
 * so `parsePilotStats` reads either. A browser fetch with no custom headers,
 * as `fetchKillmailHash` (scope decision `20260924-195833`). The URL 302s to
 * `.../kills/`; both legs are CORS-open, so the fetch follows it. Answers are
 * reused for `PILOT_STATS_CACHE_MS`, and concurrent callers share one request;
 * a failure never is reused.
 */
async function fetchEntityStats(entity: StatsEntity, id: number): Promise<PilotStatsResult> {
  return (await fetchEntityStatsRead(entity, id)).result;
}

/** A stats answer plus when it was read and whether this call reused a cached read. */
export interface PilotStatsRead {
  result: PilotStatsResult;
  fetchedAt: Date;
  fromCache: boolean;
}

/** When each cached stats answer was actually fetched, keyed like `pilotStatsCache`. */
const statsFetchedAt = new Map<string, number>();

async function fetchEntityStatsRead(entity: StatsEntity, id: number): Promise<PilotStatsRead> {
  const key = `${entity}:${id}`;
  let ranHere = false;
  const parsed = await pilotStatsCache.get(key, () =>
    guarded(key, async () => {
      ranHere = true;
      const result = await zkillJson(`https://zkillboard.com/api/stats/${entity}/${id}/`);
      if (!result.ok) return settle(key, null, result.reason);
      const value = settle(key, parsePilotStats(result.body), 'parse');
      if (value !== null) {
        statsFetchedAt.delete(key);
        statsFetchedAt.set(key, Date.now());
        if (statsFetchedAt.size > 500) {
          const oldest = statsFetchedAt.keys().next().value;
          if (oldest !== undefined) statsFetchedAt.delete(oldest);
        }
      }
      return value;
    })
  );
  if (parsed === null) {
    return {
      result: { kind: 'failed', reason: failureReason(key) },
      fetchedAt: new Date(),
      fromCache: false,
    };
  }
  return {
    result: parsed,
    fetchedAt: new Date(statsFetchedAt.get(key) ?? Date.now()),
    fromCache: !ranHere,
  };
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

/** Like `fetchCorporationStats`, with the read time and whether the cache answered. */
export function fetchCorporationStatsRead(corporationId: number): Promise<PilotStatsRead> {
  return fetchEntityStatsRead('corporationID', corporationId);
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

export type PilotKillmailsResult =
  { ok: true; entries: PilotKillmail[] } | { ok: false; reason: ZkillFailureReason };

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

type PilotListPath = 'kills' | 'losses';

const pilotListCache = createTtlCache<unknown[]>({
  ttlMs: PILOT_STATS_CACHE_MS,
  max: PILOT_LIST_CACHE_MAX,
});

/** Test seam: forget every cached pilot's kills and losses. */
export function resetPilotKillmailsCache(): void {
  pilotListCache.clear();
  failureReasons.clear();
}

/**
 * One pilot's `kills/` or `losses/` list as zKillboard sent it (first page,
 * newest first), asked for once however many readers want it: the kill history,
 * the Threat verdict's loss dates and Recent kills and losses all read the
 * same list, and the kills list is one URL for the first and the last. The
 * promise itself is cached, so two readers asking at once share one request,
 * and an answer is reused for `PILOT_STATS_CACHE_MS`. A failure, or a body
 * that is not a list, is never kept: the next reader asks again.
 */
function fetchPilotList(characterId: number, path: PilotListPath): Promise<unknown[] | null> {
  const key = `${path}/${characterId}`;
  return pilotListCache.get(key, () =>
    guarded(key, async () => {
      const result = await zkillJson(
        `https://zkillboard.com/api/${path}/characterID/${characterId}/`
      );
      if (!result.ok) return settle(key, null, result.reason);
      return settle(key, Array.isArray(result.body) ? result.body : null, 'parse');
    })
  );
}

function pilotListFailure(characterId: number, path: PilotListPath): ZkillFailureReason {
  return failureReason(`${path}/${characterId}`);
}

/** Drops one cached list, for a body that parsed as a list but could not be read. */
function forgetPilotList(characterId: number, path: PilotListPath): void {
  pilotListCache.delete(`${path}/${characterId}`);
}

async function fetchPilotSide(
  characterId: number,
  side: PilotKillmail['side']
): Promise<PilotKillmail[] | null> {
  const body = await fetchPilotList(characterId, side === 'kill' ? 'kills' : 'losses');
  return body === null ? null : parsePilotKillmails(body, side);
}

/**
 * A pilot's most recent kills and losses, merged newest first (killmail ids
 * rise with time), for Pilot Lookup. A browser fetch with no custom headers,
 * as `fetchKillmailHash` (scope decision `20260924-195833`). Either list
 * failing fails the whole answer — kills alone would misstate the record.
 * Both lists come through `fetchPilotList`, shared with the kill history and
 * the Threat verdict.
 */
export async function fetchPilotKillmails(characterId: number): Promise<PilotKillmailsResult> {
  try {
    const [kills, losses] = await Promise.all([
      fetchPilotSide(characterId, 'kill'),
      fetchPilotSide(characterId, 'loss'),
    ]);
    if (kills === null) return { ok: false, reason: pilotListFailure(characterId, 'kills') };
    if (losses === null) return { ok: false, reason: pilotListFailure(characterId, 'losses') };
    const entries = [...kills, ...losses]
      .sort((a, b) => b.killmailId - a.killmailId)
      .slice(0, PILOT_KILLMAIL_LIMIT);
    return { ok: true, entries };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}

/** zKillboard's page size for a `kills/` or `losses/` list: a full page means older ones exist. */
export const PILOT_LIST_PAGE_SIZE = 200;

export type PilotKillmailHistoryResult =
  | {
      ok: true;
      /** Every kill and loss on the first page of each list, newest first; only entries that state a time. */
      entries: PilotKillmail[];
      /**
       * How far back the lists are known to reach, in ms: the newest of the
       * oldest dates among lists that came back full. Null when no list was
       * full, so the whole record is held.
       */
      reachesBackTo: number | null;
    }
  | { ok: false; reason: ZkillFailureReason };

function timeOf(entry: PilotKillmail): number {
  const at = entry.detail?.time ? Date.parse(entry.detail.time) : Number.NaN;
  return Number.isFinite(at) ? at : Number.NaN;
}

/**
 * A pilot's kills and losses as far back as zKillboard's first page of each
 * list reaches (200 each), for the Overview's Kills and losses widget. Both
 * lists come through `fetchPilotList`, so the request is shared with Pilot
 * Lookup and cached for `PILOT_STATS_CACHE_MS`, which is also the rate limit:
 * a refresh inside that window asks zKillboard nothing. Either list failing,
 * or lists that hold only hash-only entries (no time to count by), fail the
 * whole answer rather than read as "none".
 */
export async function fetchPilotKillmailHistory(
  characterId: number
): Promise<PilotKillmailHistoryResult> {
  try {
    const [killBody, lossBody] = await Promise.all([
      fetchPilotList(characterId, 'kills'),
      fetchPilotList(characterId, 'losses'),
    ]);
    if (killBody === null) return { ok: false, reason: pilotListFailure(characterId, 'kills') };
    if (lossBody === null) return { ok: false, reason: pilotListFailure(characterId, 'losses') };
    const parsed = [
      ...parsePilotKillmails(killBody, 'kill'),
      ...parsePilotKillmails(lossBody, 'loss'),
    ];
    const entries = parsed.filter((entry) => Number.isFinite(timeOf(entry)));
    if (killBody.length + lossBody.length > 0 && entries.length === 0) {
      forgetPilotList(characterId, 'kills');
      forgetPilotList(characterId, 'losses');
      return { ok: false, reason: 'parse' };
    }
    let reachesBackTo: number | null = null;
    for (const [body, side] of [
      [killBody, 'kill'],
      [lossBody, 'loss'],
    ] as const) {
      if (body.length < PILOT_LIST_PAGE_SIZE) continue;
      const oldest = Math.min(
        ...entries.filter((entry) => entry.side === side).map((entry) => timeOf(entry))
      );
      if (Number.isFinite(oldest)) {
        reachesBackTo = reachesBackTo === null ? oldest : Math.max(reachesBackTo, oldest);
      }
    }
    entries.sort((a, b) => timeOf(b) - timeOf(a));
    return { ok: true, entries, reachesBackTo };
  } catch {
    return { ok: false, reason: 'parse' };
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

export type PilotKillHistoryResult =
  { ok: true; kills: KillRecord[] } | { ok: false; reason: ZkillFailureReason };

/** Test seam: forget every cached kill history (and the lists beside it). */
export function resetPilotKillHistoryCache(): void {
  pilotListCache.clear();
  failureReasons.clear();
}

/**
 * A pilot's latest kills (zKillboard's first page, newest first; up to 200),
 * for the Local list's per-space columns, the modal's chart and the Threat
 * verdict. Kills only: the verdict reads a pilot's losses separately and only
 * when it must. A browser fetch with no custom headers, as `fetchKillmailHash`
 * (decision `20260924-195833`). The request is shared with Recent kills and
 * losses (`fetchPilotList`); a failure is never reused.
 */
export async function fetchPilotKillHistory(characterId: number): Promise<PilotKillHistoryResult> {
  const body = await fetchPilotList(characterId, 'kills');
  if (body === null) return { ok: false, reason: pilotListFailure(characterId, 'kills') };
  const kills = parseKillHistory(body, characterId);
  // Entries that carry no killmail body (hash only) can't be dated: that is a
  // list we couldn't read, never "no kills".
  if (body.length > 0 && kills.length === 0) {
    forgetPilotList(characterId, 'kills');
    return { ok: false, reason: 'parse' };
  }
  return { ok: true, kills };
}

/** `ok: false` when zKillboard failed or rate-limited, so "no kills" and "couldn't load" differ. */
export type SystemRecentKillsResult =
  { ok: true; kills: RecentKill[] } | { ok: false; reason: ZkillFailureReason };

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

/** Concurrent callers for one system share one request; nothing is reused once it settles. */
const systemKillsInflight = createTtlCache<RecentKill[]>({ ttlMs: 0, max: 200 });

/**
 * A solar system's player kills from the last hour, for Route Safety. A
 * browser fetch with no custom headers, as `fetchKillmailHash` (scope
 * decision `20260924-195833`).
 */
export async function fetchSystemRecentKills(systemId: number): Promise<SystemRecentKillsResult> {
  const key = `system:${systemId}`;
  const kills = await systemKillsInflight.get(String(systemId), () =>
    guarded(key, async () => {
      const result = await zkillJson(
        `https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`
      );
      if (!result.ok) return settle(key, null, result.reason);
      return settle(
        key,
        Array.isArray(result.body) ? parseSystemKills(result.body) : null,
        'parse'
      );
    })
  );
  return kills === null ? { ok: false, reason: failureReason(key) } : { ok: true, kills };
}

/** zKillboard's page size: a page with this many entries may have a next page. */
export const REGION_PAGE_SIZE = 1000;

/** A backstop on paging, far above any real hour (a page holds 1,000 kills). */
const REGION_MAX_PAGES = 10;

/** `ok: false` when zKillboard failed or rate-limited, so "no kills" and "couldn't load" differ. */
export type RegionRecentKillsResult =
  | { ok: true; bySystem: ReadonlyMap<number, RecentKill[]> }
  | { ok: false; reason: ZkillFailureReason };

/**
 * A region's player kills from the last hour (or `pastSeconds`), grouped by system, for Route
 * Safety: one request covers every route system in the region, where the
 * system API needs one each (zKillboard no longer takes comma-separated ids).
 * Follows `/page/n/` while a page is full, so a busy region is never cut at
 * 1,000 kills; any page failing, or the page cap being hit, fails the whole answer. A browser fetch with
 * no custom headers, as `fetchKillmailHash`.
 */
export async function fetchRegionRecentKills(
  regionId: number,
  pastSeconds: number = 3600
): Promise<RegionRecentKillsResult> {
  const bySystem = new Map<number, RecentKill[]>();
  // New kills shift the pages while they are read, so one can show on two.
  const seen = new Set<number>();
  for (let pageNumber = 1; pageNumber <= REGION_MAX_PAGES; pageNumber += 1) {
    const suffix = pageNumber === 1 ? '' : `page/${pageNumber}/`;
    const result = await zkillJson(
      `https://zkillboard.com/api/kills/regionID/${regionId}/pastSeconds/${pastSeconds}/${suffix}`
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    const { body } = result;
    // An error body is a failure, not an empty hour.
    if (!Array.isArray(body)) return { ok: false, reason: 'parse' };
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
  return { ok: false, reason: 'parse' };
}

export function systemZkillUrl(systemId: number): string {
  return `https://zkillboard.com/system/${systemId}/`;
}

export function warZkillUrl(warId: number): string {
  return `https://zkillboard.com/war/${warId}/`;
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
