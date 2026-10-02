/**
 * Public, unauthenticated lookups for *another* entity's Character /
 * Corporation / Alliance info — the data `PublicInfoModal` renders. Cached
 * like `stations.ts` under the global sentinel: these endpoints need no
 * scope and the fields shown (name, ticker, bio) rarely change, so the
 * `STALE_AFTER.static` window applies here too.
 *
 * Deliberately separate from `stores/publicInfo.ts`, which only caches the
 * signed-in Character's own `{ corporationName, allianceName }` strings for
 * `CharacterHeader` — this module needs the full record (ticker, member
 * count, CEO) for a Character that need not be one already known locally.
 */
import {
  getCharacterPublicInfo,
  getCorporationPublicInfo,
  getAlliancePublicInfo,
  getCharacterCorporationHistory,
  getCorporationAllianceHistory,
  type CharacterPublicInfo,
  type CorporationPublicInfo,
  type AlliancePublicInfo,
} from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
} from '@/esi/cache';
import { resolveNames } from './names';
import { deriveEmploymentHistoryRows, type EmploymentHistoryRow } from './employmentHistory';
import { deriveAllianceHistoryRows, type AllianceHistoryRow } from './corporationInfo';

export interface PublicCharacterInfo extends CharacterPublicInfo {
  character_id: number;
}

export interface PublicCorporationInfo extends CorporationPublicInfo {
  corporation_id: number;
  /** Resolved from `ceo_id` via `resolveNames`; null if that lookup failed. */
  ceoName: string | null;
  /** Resolved from `creator_id` the same way. */
  creatorName: string | null;
}

export interface PublicAllianceInfo extends AlliancePublicInfo {
  alliance_id: number;
}

export async function loadPublicCharacterInfo(
  characterId: number
): Promise<PublicCharacterInfo | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterPublicInfo(characterId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-character:${characterId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  return result ? { ...result.data, character_id: characterId } : null;
}

export async function loadPublicCorporationInfo(
  corporationId: number
): Promise<PublicCorporationInfo | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationPublicInfo(corporationId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-corporation:${corporationId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  if (!result) return null;
  const names = await resolveNames([...new Set([result.data.ceo_id, result.data.creator_id])]);
  return {
    ...result.data,
    corporation_id: corporationId,
    ceoName: names.get(result.data.ceo_id) ?? null,
    creatorName: names.get(result.data.creator_id) ?? null,
  };
}

export async function loadPublicAllianceInfo(
  allianceId: number
): Promise<PublicAllianceInfo | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getAlliancePublicInfo(allianceId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-alliance:${allianceId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  return result ? { ...result.data, alliance_id: allianceId } : null;
}

export interface PublicEmploymentHistory {
  rows: EmploymentHistoryRow[];
  /** Corporation id -> name; `resolveNames` falls back to `#id`. */
  names: Map<number, string>;
}

/**
 * Another Character's corporation history. Cached under the global sentinel
 * (not the looked-up id) so `purgeCharacterCache` never has to know about
 * characters that aren't signed in here — unlike `loadEmploymentHistory`,
 * which is keyed to the active Character.
 */
export async function loadPublicEmploymentHistory(
  characterId: number
): Promise<PublicEmploymentHistory | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterCorporationHistory(characterId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-employment:${characterId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  if (!result) return null;
  const rows = deriveEmploymentHistoryRows(result.data, Date.now());
  const names = await resolveNames([...new Set(rows.map((r) => r.corporationId))]);
  return { rows, names };
}

export interface PublicAllianceHistory {
  rows: AllianceHistoryRow[];
  names: Map<number, string>;
}

/**
 * Another corporation's alliance history, cached under the global sentinel
 * like `loadPublicEmploymentHistory`. Null when ESI could not be reached and
 * nothing was cached — the tab hides the section rather than showing an error
 * for one part of an otherwise-loaded corporation.
 */
export async function loadPublicAllianceHistory(
  corporationId: number
): Promise<PublicAllianceHistory | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationAllianceHistory(corporationId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-alliance-history:${corporationId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  if (!result) return null;
  const rows = deriveAllianceHistoryRows(result.data);
  const ids = [
    ...new Set(rows.flatMap((row) => (row.allianceId === null ? [] : [row.allianceId]))),
  ];
  const names = ids.length > 0 ? await resolveNames(ids) : new Map<number, string>();
  return { rows, names };
}
