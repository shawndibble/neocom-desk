import { getCharacterPublicInfo, postUniverseIds, type CharacterPublicInfo } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { affiliationFetchedAt, resolveAffiliations } from '@/features/character/affiliations';
import { resolveNames } from '@/features/character/names';
import { loadPublicCharacterInfoWithAge } from '@/features/character/publicInfoData';
import {
  achievementFromPublicInfo,
  type CharacterAchievement,
} from '@/features/character/achievement';
import { DAY_MS } from '@/lib/age';

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
  securityStatus: number | null;
  achievement: CharacterAchievement;
  fetchedAt: Date;
}

export function searchBoxSeed(state: {
  resolved: PilotSummary | null;
  seededId: number | null;
  typing: boolean;
}): string | null {
  if (state.resolved === null || state.typing) return null;
  return state.resolved.characterId === state.seededId ? null : state.resolved.name;
}

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
  const days = Math.floor((now.getTime() - anniversary(years).getTime()) / DAY_MS);
  return { years, days };
}

export async function resolvePilotByName(
  name: string,
  signal?: AbortSignal
): Promise<PilotSummary | null> {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  const match = (await postUniverseIds([trimmed], { signal })).characters?.[0];
  return match ? { characterId: match.id, name: match.name } : null;
}

async function publicInfoOrNull(characterId: number): Promise<CharacterPublicInfo | null> {
  try {
    return (await getCharacterPublicInfo(characterId)).data;
  } catch (err) {
    if (err instanceof EsiError && err.status === 404) return null;
    throw err;
  }
}

export async function loadPilotProfile(characterId: number): Promise<PilotProfile | null> {
  const [cached, affiliations] = await Promise.all([
    loadPublicCharacterInfoWithAge(characterId),
    resolveAffiliations([characterId]),
  ]);
  const info = cached?.info ?? (await publicInfoOrNull(characterId));
  if (info === null) return null;
  const affiliationAt = affiliations.has(characterId)
    ? await affiliationFetchedAt(characterId)
    : null;
  const fetchedAt = affiliationAt ?? cached?.fetchedAt ?? new Date();
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
    securityStatus: info.security_status ?? null,
    achievement: achievementFromPublicInfo(info),
    fetchedAt,
  };
}
