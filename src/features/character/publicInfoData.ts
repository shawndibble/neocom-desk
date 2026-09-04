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
  type CharacterPublicInfo,
  type CorporationPublicInfo,
  type AlliancePublicInfo,
} from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';
import { resolveNames } from './names';

export interface PublicCharacterInfo extends CharacterPublicInfo {
  character_id: number;
}

export interface PublicCorporationInfo extends CorporationPublicInfo {
  corporation_id: number;
  /** Resolved from `ceo_id` via `resolveNames`; null if that lookup failed. */
  ceoName: string | null;
}

export interface PublicAllianceInfo extends AlliancePublicInfo {
  alliance_id: number;
}

export async function loadPublicCharacterInfo(
  characterId: number
): Promise<PublicCharacterInfo | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-character:${characterId}`,
    async () => (await getCharacterPublicInfo(characterId)).data,
    { staleAfterMs: STALE_AFTER.static }
  );
  return result ? { ...result.data, character_id: characterId } : null;
}

export async function loadPublicCorporationInfo(
  corporationId: number
): Promise<PublicCorporationInfo | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-corporation:${corporationId}`,
    async () => (await getCorporationPublicInfo(corporationId)).data,
    { staleAfterMs: STALE_AFTER.static }
  );
  if (!result) return null;
  const names = await resolveNames([result.data.ceo_id]);
  return {
    ...result.data,
    corporation_id: corporationId,
    ceoName: names.get(result.data.ceo_id) ?? null,
  };
}

export async function loadPublicAllianceInfo(
  allianceId: number
): Promise<PublicAllianceInfo | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-alliance:${allianceId}`,
    async () => (await getAlliancePublicInfo(allianceId)).data,
    { staleAfterMs: STALE_AFTER.static }
  );
  return result ? { ...result.data, alliance_id: allianceId } : null;
}
