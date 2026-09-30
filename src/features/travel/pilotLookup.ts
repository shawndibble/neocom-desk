/**
 * Travel › Pilot Lookup (issue #2331): who a pilot is — name, corporation,
 * alliance and character age — from public ESI alone. Their kills and losses
 * come from zKillboard (`lib/zkillboard.ts`), not from here.
 */
import { getCharacterPublicInfo, postUniverseIds, type CharacterPublicInfo } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { resolveAffiliations } from '@/features/character/affiliations';
import { resolveNames } from '@/features/character/names';
import { loadPublicCharacterInfo } from '@/features/character/publicInfoData';

export interface PilotSummary {
  characterId: number;
  name: string;
}

export interface PilotProfile {
  characterId: number;
  name: string;
  birthday: string;
  corporationId: number;
  corporationName: string | null;
  allianceId: number | null;
  allianceName: string | null;
}

/**
 * Whole years since the birthday (counted to its last anniversary, in UTC) and
 * the days since that anniversary. Null for an unreadable or future birthday.
 */
export function pilotAge(birthday: string, now: Date): { years: number; days: number } | null {
  const born = new Date(birthday);
  if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) return null;
  let years = now.getUTCFullYear() - born.getUTCFullYear();
  const anniversary = (count: number) => {
    const date = new Date(born.getTime());
    date.setUTCFullYear(born.getUTCFullYear() + count);
    return date;
  };
  if (anniversary(years).getTime() > now.getTime()) years -= 1;
  const days = Math.floor((now.getTime() - anniversary(years).getTime()) / 86_400_000);
  return { years, days };
}

/** An exact (case-insensitive) character name through public `POST /universe/ids`; null when none. */
export async function resolvePilotByName(
  name: string,
  signal?: AbortSignal
): Promise<PilotSummary | null> {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  const match = (await postUniverseIds([trimmed], { signal })).characters?.[0];
  return match ? { characterId: match.id, name: match.name } : null;
}

/**
 * The public record when the cached loader came back empty. That loader folds
 * "ESI has no such character" and "ESI could not be reached" into the same
 * null, and Pilot Lookup shows those differently, so one direct request
 * tells them apart: a 404 is null, any other failure throws.
 */
async function publicInfoOrNull(characterId: number): Promise<CharacterPublicInfo | null> {
  try {
    return (await getCharacterPublicInfo(characterId)).data;
  } catch (err) {
    if (err instanceof EsiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * The pilot's public record joined with their current affiliation. The public
 * record is cached as static, so its `corporation_id` can be stale — the
 * affiliation lookup is what moves, and wins when it answered. Null when ESI
 * has no such character; rejects when ESI could not be reached.
 */
export async function loadPilotProfile(characterId: number): Promise<PilotProfile | null> {
  const [cached, affiliations] = await Promise.all([
    loadPublicCharacterInfo(characterId),
    resolveAffiliations([characterId]),
  ]);
  const info = cached ?? (await publicInfoOrNull(characterId));
  if (info === null) return null;
  const affiliation = affiliations.get(characterId);
  const corporationId = affiliation?.corporation_id ?? info.corporation_id;
  const allianceId = (affiliation ? affiliation.alliance_id : info.alliance_id) ?? null;
  const names = await resolveNames(
    allianceId === null ? [corporationId] : [corporationId, allianceId]
  );
  return {
    characterId,
    name: info.name,
    birthday: info.birthday,
    corporationId,
    corporationName: names.get(corporationId) ?? null,
    allianceId,
    allianceName: allianceId === null ? null : (names.get(allianceId) ?? null),
  };
}
