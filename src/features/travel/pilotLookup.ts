/**
 * Travel › Pilot Lookup (issue #2331): who a pilot is — name, corporation,
 * alliance and character age — from public ESI alone. Their kills and losses
 * come from zKillboard (`lib/zkillboard.ts`), not from here.
 */
import { getCharacterPublicInfo, postUniverseIds, type CharacterPublicInfo } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { affiliationFetchedAt, resolveAffiliations } from '@/features/character/affiliations';
import { resolveNames } from '@/features/character/names';
import { loadPublicCharacterInfoWithAge } from '@/features/character/publicInfoData';
import {
  achievementFromPublicInfo,
  type CharacterAchievement,
} from '@/features/character/achievement';

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
  /** Null when ESI left it out of the public record. */
  securityStatus: number | null;
  /** Achievement score and displayed title (issue #4777); a score of 0 and no title when ESI sent neither. */
  achievement: CharacterAchievement;
  /**
   * When this was last read from ESI. The affiliation read when there is one,
   * since that is the part that moves; else the public record's. A profile
   * served from cache is as old as its rows, not as new as the lookup.
   */
  fetchedAt: Date;
}

/**
 * What the search box should show for the pilot in the URL, or null to leave it
 * alone. The URL can change without the box (reload, pasted link, Back), so a
 * resolved pilot not yet shown is seeded; a user mid-keystroke is never overwritten.
 */
export function searchBoxSeed(state: {
  resolved: PilotSummary | null;
  /** The pilot whose name the box last showed, by seeding or by choosing. */
  seededId: number | null;
  typing: boolean;
}): string | null {
  if (state.resolved === null || state.typing) return null;
  return state.resolved.characterId === state.seededId ? null : state.resolved.name;
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
