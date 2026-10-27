/**
 * Public, unauthenticated lookups for *another* entity's Character /
 * Corporation / Alliance info — the data `PublicInfoModal` renders. Cached
 * like `stations.ts` under the global sentinel: these endpoints need no
 * scope and the fields shown (name, ticker, bio) rarely change, so the
 * `STALE_AFTER.static` window applies here too.
 *
 * `stores/publicInfo.ts` reads through these loaders too, so the
 * `{ corporationName, allianceName }` strings `CharacterHeader` shows survive
 * a cold start offline; this module also serves the full record (ticker,
 * member count, CEO) for a Character that need not be one already known
 * locally.
 */
import {
  getCharacterPublicInfo,
  getCorporationPublicInfo,
  getAlliancePublicInfo,
  getCharacterCorporationHistory,
  getCorporationAllianceHistory,
  getAllianceCorporations,
  type CharacterPublicInfo,
  type CorporationPublicInfo,
  type AlliancePublicInfo,
} from '@/esi/endpoints';
import {
  conditionalFetch,
  loadStaticEntity,
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
} from '@/esi/cache';
import { resolveNames } from './names';
import {
  deriveEmploymentHistoryRows,
  deriveEmploymentSummary,
  type EmploymentHistoryRow,
  type EmploymentSummary,
} from './employmentHistory';
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

/**
 * `staleAfterMs` defaults to the long static window. A caller that must notice
 * the character *changing corporation* (`stores/publicInfo`, issue #293) passes
 * a short one, so online it reads live and a lapsed row is only the offline
 * fallback.
 */
export async function loadPublicCharacterInfo(
  characterId: number,
  options: { staleAfterMs?: number } = {}
): Promise<PublicCharacterInfo | null> {
  return (await loadPublicCharacterInfoWithAge(characterId, options))?.info ?? null;
}

/** `loadPublicCharacterInfo`, with when the record was actually read from ESI (a cache hit is older than the call). */
export async function loadPublicCharacterInfoWithAge(
  characterId: number,
  options: { staleAfterMs?: number } = {}
): Promise<{ info: PublicCharacterInfo; fetchedAt: Date } | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterPublicInfo(characterId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-character:${characterId}`,
    fetchLive,
    { staleAfterMs: options.staleAfterMs ?? STALE_AFTER.static, conditional }
  );
  return result
    ? { info: { ...result.data, character_id: characterId }, fetchedAt: result.fetchedAt }
    : null;
}

/**
 * The corporation's own public record, without resolving its CEO / creator
 * names — for a caller (the corp name in a header) that needs only the record.
 */
export async function loadPublicCorporationRecord(
  corporationId: number
): Promise<(CorporationPublicInfo & { corporation_id: number }) | null> {
  const result = await loadStaticEntity(
    'public-corporation',
    corporationId,
    getCorporationPublicInfo
  );
  return result ? { ...result.data, corporation_id: corporationId } : null;
}

export async function loadPublicCorporationInfo(
  corporationId: number
): Promise<PublicCorporationInfo | null> {
  const record = await loadPublicCorporationRecord(corporationId);
  if (!record) return null;
  const names = await resolveNames([...new Set([record.ceo_id, record.creator_id])]);
  return {
    ...record,
    ceoName: names.get(record.ceo_id) ?? null,
    creatorName: names.get(record.creator_id) ?? null,
  };
}

export async function loadPublicAllianceInfo(
  allianceId: number
): Promise<PublicAllianceInfo | null> {
  const result = await loadStaticEntity('public-alliance', allianceId, getAlliancePublicInfo);
  return result ? { ...result.data, alliance_id: allianceId } : null;
}

export interface PublicEmploymentHistory {
  rows: EmploymentHistoryRow[];
  summary: EmploymentSummary;
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
  const result = await loadStaticEntity(
    'public-employment',
    characterId,
    getCharacterCorporationHistory
  );
  if (!result) return null;
  const now = Date.now();
  const rows = deriveEmploymentHistoryRows(result.data, now);
  const names = await resolveNames([...new Set(rows.map((r) => r.corporationId))]);
  return { rows, summary: deriveEmploymentSummary(rows, now), names };
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
  const result = await loadStaticEntity(
    'public-alliance-history',
    corporationId,
    getCorporationAllianceHistory
  );
  if (!result) return null;
  const rows = deriveAllianceHistoryRows(result.data);
  const ids = [
    ...new Set(rows.flatMap((row) => (row.allianceId === null ? [] : [row.allianceId]))),
  ];
  const names = ids.length > 0 ? await resolveNames(ids) : new Map<number, string>();
  return { rows, names };
}

export interface PublicAllianceCorporations {
  /** Member corporations, by name — the order ESI gives them in means nothing. */
  corporations: { id: number; name: string | null }[];
}

/**
 * Another alliance's member corporations, cached under the global sentinel
 * like the rest of this module. Null when ESI could not be reached and
 * nothing was cached; the tab then leaves the list out.
 */
export async function loadPublicAllianceCorporations(
  allianceId: number
): Promise<PublicAllianceCorporations | null> {
  const result = await loadStaticEntity(
    'public-alliance-corporations',
    allianceId,
    getAllianceCorporations
  );
  if (!result) return null;
  const names =
    result.data.length > 0 ? await resolveNames(result.data) : new Map<number, string>();
  const corporations = result.data
    .map((id) => ({ id, name: names.get(id) ?? null }))
    .sort((a, b) => (a.name ?? `#${a.id}`).localeCompare(b.name ?? `#${b.id}`));
  return { corporations };
}
