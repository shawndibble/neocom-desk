import type { KillmailHashLookup } from '@/engine/fittings/load';
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { createTtlCache } from '@/lib/ttlCache';
import type { KillRecord, KillSpace } from '@/engine/pilotList/killActivity';
import type { RecentKill, RecentKillAttacker, RecentKillVictim } from '@/engine/route/recentKills';
import { isRecord } from '@/engine/guards';
import { MINUTE_MS } from '@/lib/age';

export type ZkillFailureReason = 'offline' | 'rate-limited' | 'http' | 'parse';

type ZkillJson =
  { ok: true; body: unknown } | { ok: false; reason: ZkillFailureReason; status: number | null };

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

const failureReasons = new Map<string, ZkillFailureReason>();

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

const FAILURE_REASONS_MAX = 200;

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

export async function fetchKillmailHash(killmailId: number): Promise<KillmailHashLookup> {
  const result = await zkillJson(`https://zkillboard.com/api/killID/${killmailId}/`);
  if (!result.ok) return { status: result.status === 404 ? 'not-found' : 'unreachable' };
  const { body } = result;
  const hash = Array.isArray(body) ? (body[0] as { zkb?: { hash?: unknown } })?.zkb?.hash : null;
  return typeof hash === 'string' ? { status: 'ok', hash } : { status: 'not-found' };
}

const HULL_LOSS_LIMIT = 40;

export interface ZkillHullLoss {
  killmailId: number;
  hash: string;
  value: number | null;
  time: string | null;
  victim: KillmailVictim | null;
}

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

const hullLossesInflight = createTtlCache<ZkillHullLoss[]>({ ttlMs: 0, max: 50 });

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

export const PILOT_TOP_SHIPS = 5;

export const PILOT_STATS_CACHE_MS = 10 * MINUTE_MS;

export interface PilotTopShip {
  shipTypeId: number;
  kills: number;
}

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
  memberCount: number | null;
}

export type PilotStatsParse = { kind: 'stats'; stats: PilotStats } | { kind: 'no-history' };

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

const UNKNOWN_ID_ERROR = 'Invalid type or id';

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

const PILOT_LIST_CACHE_MAX = 120;

const pilotStatsCache = createTtlCache<PilotStatsParse>({
  ttlMs: PILOT_STATS_CACHE_MS,
  max: 500,
});

export function resetPilotStatsCache(): void {
  pilotStatsCache.clear();
  statsFetchedAt.clear();
  failureReasons.clear();
}

async function fetchEntityStats(entity: StatsEntity, id: number): Promise<PilotStatsResult> {
  return (await fetchEntityStatsRead(entity, id)).result;
}

export interface PilotStatsRead {
  result: PilotStatsResult;
  fetchedAt: Date;
  fromCache: boolean;
}

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

export function fetchPilotStats(characterId: number): Promise<PilotStatsResult> {
  return fetchEntityStats('characterID', characterId);
}

export function fetchAllianceStats(allianceId: number): Promise<PilotStatsResult> {
  return fetchEntityStats('allianceID', allianceId);
}

export function fetchCorporationStats(corporationId: number): Promise<PilotStatsResult> {
  return fetchEntityStats('corporationID', corporationId);
}

export function fetchCorporationStatsRead(corporationId: number): Promise<PilotStatsRead> {
  return fetchEntityStatsRead('corporationID', corporationId);
}

export const PILOT_KILLMAIL_LIMIT = 25;

export interface KillmailParty {
  characterId: number | null;
  corporationId: number | null;
  shipTypeId: number | null;
}

export interface KillmailDetail {
  time: string | null;
  systemId: number | null;
  victim: KillmailVictim;
  victimParty: KillmailParty;
  finalBlow: KillmailParty | null;
}

export interface PilotKillmail {
  killmailId: number;
  hash: string;
  side: 'kill' | 'loss';
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

export function resetPilotKillmailsCache(): void {
  pilotListCache.clear();
  failureReasons.clear();
}

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

export const PILOT_LIST_PAGE_SIZE = 200;

export type PilotKillmailHistoryResult =
  | {
      ok: true;
      entries: PilotKillmail[];
      reachesBackTo: number | null;
    }
  | { ok: false; reason: ZkillFailureReason };

function timeOf(entry: PilotKillmail): number {
  const at = entry.detail?.time ? Date.parse(entry.detail.time) : Number.NaN;
  return Number.isFinite(at) ? at : Number.NaN;
}

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
      attackerCount: Array.isArray(entry.attackers) ? entry.attackers.length : null,
    });
  }
  return kills;
}

export type PilotKillHistoryResult =
  { ok: true; kills: KillRecord[] } | { ok: false; reason: ZkillFailureReason };

export function resetPilotKillHistoryCache(): void {
  pilotListCache.clear();
  failureReasons.clear();
}

export async function fetchPilotKillHistory(characterId: number): Promise<PilotKillHistoryResult> {
  const body = await fetchPilotList(characterId, 'kills');
  if (body === null) return { ok: false, reason: pilotListFailure(characterId, 'kills') };
  const kills = parseKillHistory(body, characterId);
  if (body.length > 0 && kills.length === 0) {
    forgetPilotList(characterId, 'kills');
    return { ok: false, reason: 'parse' };
  }
  return { ok: true, kills };
}

export interface KillInvolvement {
  killmailId: number;
  timeMs: number;
  value: number | null;
  victimCharacterId: number | null;
  attackerCharacterIds: number[];
}

export function parseKillInvolvements(body: unknown): KillInvolvement[] {
  if (!Array.isArray(body)) return [];
  const out: KillInvolvement[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_id !== 'number') continue;
    const timeMs =
      typeof entry.killmail_time === 'string' ? Date.parse(entry.killmail_time) : Number.NaN;
    if (!Number.isFinite(timeMs)) continue;
    const attackers = Array.isArray(entry.attackers) ? entry.attackers.filter(isRecord) : [];
    out.push({
      killmailId: entry.killmail_id,
      timeMs,
      value: isRecord(entry.zkb) ? finiteOrNull(entry.zkb.totalValue) : null,
      victimCharacterId: isRecord(entry.victim) ? finiteOrNull(entry.victim.character_id) : null,
      attackerCharacterIds: attackers.flatMap((a) => finiteOrNull(a.character_id) ?? []),
    });
  }
  return out;
}

export type PilotInvolvementsResult =
  | { ok: true; kills: KillInvolvement[]; losses: KillInvolvement[] }
  | { ok: false; reason: ZkillFailureReason };

export async function fetchPilotInvolvements(
  characterId: number
): Promise<PilotInvolvementsResult> {
  try {
    const [kills, losses] = await Promise.all([
      fetchPilotList(characterId, 'kills'),
      fetchPilotList(characterId, 'losses'),
    ]);
    if (kills === null) return { ok: false, reason: pilotListFailure(characterId, 'kills') };
    if (losses === null) return { ok: false, reason: pilotListFailure(characterId, 'losses') };
    return { ok: true, kills: parseKillInvolvements(kills), losses: parseKillInvolvements(losses) };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}

export type SystemRecentKillsResult =
  { ok: true; kills: RecentKill[] } | { ok: false; reason: ZkillFailureReason };

function parseAttacker(value: unknown): RecentKillAttacker | null {
  if (!isRecord(value)) return null;
  const attacker: RecentKillAttacker = {};
  if (typeof value.ship_type_id === 'number') attacker.shipTypeId = value.ship_type_id;
  if (typeof value.weapon_type_id === 'number') attacker.weaponTypeId = value.weapon_type_id;
  const characterId = finiteOrNull(value.character_id);
  const corporationId = finiteOrNull(value.corporation_id);
  const allianceId = finiteOrNull(value.alliance_id);
  if (characterId !== null) attacker.characterId = characterId;
  if (corporationId !== null) attacker.corporationId = corporationId;
  if (allianceId !== null) attacker.allianceId = allianceId;
  if (value.final_blow === true) attacker.finalBlow = true;
  return attacker;
}

function parseKillVictim(value: unknown): RecentKillVictim | undefined {
  if (!isRecord(value)) return undefined;
  return {
    characterId: finiteOrNull(value.character_id),
    corporationId: finiteOrNull(value.corporation_id),
    allianceId: finiteOrNull(value.alliance_id),
    shipTypeId: finiteOrNull(value.ship_type_id),
  };
}

function parseRecentKill(entry: unknown): RecentKill | null {
  if (!isRecord(entry) || typeof entry.killmail_id !== 'number') return null;
  const time = typeof entry.killmail_time === 'string' ? Date.parse(entry.killmail_time) : NaN;
  if (!Number.isFinite(time)) return null;
  const zkb = isRecord(entry.zkb) ? entry.zkb : {};
  if (zkb.npc === true) return null;
  const victim = parseKillVictim(entry.victim);
  const value = finiteOrNull(zkb.totalValue);
  return {
    killmailId: entry.killmail_id,
    time,
    locationId: finiteOrNull(zkb.locationID),
    attackers: Array.isArray(entry.attackers)
      ? entry.attackers.flatMap((attacker) => parseAttacker(attacker) ?? [])
      : [],
    ...(victim ? { victim } : {}),
    ...(value !== null ? { value } : {}),
  };
}

export function parseSystemKills(body: unknown): RecentKill[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((entry) => parseRecentKill(entry) ?? []);
}

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

const systemKillsInflight = createTtlCache<RecentKill[]>({ ttlMs: 0, max: 200 });

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

export const REGION_PAGE_SIZE = 1000;

const REGION_MAX_PAGES = 10;

export type RegionRecentKillsResult =
  | { ok: true; bySystem: ReadonlyMap<number, RecentKill[]> }
  | { ok: false; reason: ZkillFailureReason };

export async function fetchRegionRecentKills(
  regionId: number,
  pastSeconds: number = 3600
): Promise<RegionRecentKillsResult> {
  const bySystem = new Map<number, RecentKill[]>();
  const seen = new Set<number>();
  for (let pageNumber = 1; pageNumber <= REGION_MAX_PAGES; pageNumber += 1) {
    const suffix = pageNumber === 1 ? '' : `page/${pageNumber}/`;
    const result = await zkillJson(
      `https://zkillboard.com/api/kills/regionID/${regionId}/pastSeconds/${pastSeconds}/${suffix}`
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    const { body } = result;
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
  return { ok: false, reason: 'parse' };
}

export interface ZkillEntityHit {
  id: number;
  name: string;
  kind: 'character' | 'corporation' | 'alliance';
}

export function parseEntityAutocomplete(body: unknown): ZkillEntityHit[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((entry): ZkillEntityHit[] => {
    if (!isRecord(entry)) return [];
    const { id, name, type } = entry;
    const known = type === 'character' || type === 'corporation' || type === 'alliance';
    return known && typeof id === 'number' && typeof name === 'string' && name !== ''
      ? [{ id, name, kind: type }]
      : [];
  });
}

export async function searchZkillEntities(query: string): Promise<ZkillEntityHit[]> {
  const answer = await zkillJson(
    `https://zkillboard.com/autocomplete/${encodeURIComponent(query)}/`
  );
  return answer.ok ? parseEntityAutocomplete(answer.body) : [];
}

export function systemZkillUrl(systemId: number): string {
  return `https://zkillboard.com/system/${systemId}/`;
}

export function killZkillUrl(killmailId: number): string {
  return `https://zkillboard.com/kill/${killmailId}/`;
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
