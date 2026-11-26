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
  ceoName: string | null;
  creatorName: string | null;
}

export interface PublicAllianceInfo extends AlliancePublicInfo {
  alliance_id: number;
}

export async function loadPublicCharacterInfo(
  characterId: number,
  options: { staleAfterMs?: number } = {}
): Promise<PublicCharacterInfo | null> {
  return (await loadPublicCharacterInfoWithAge(characterId, options))?.info ?? null;
}

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
  names: Map<number, string>;
}

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
  corporations: { id: number; name: string | null }[];
}

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
