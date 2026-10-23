/**
 * A Character's achievement score and displayed title (issue #4777), from the
 * public record (`GET /characters/{id}`, compat date 2026-06-09). The title
 * comes as a `characterTitles` UUID; its name is the baked SDE table's.
 */
import type { CharacterContact, CharacterPublicInfo } from '@/esi/endpoints';
import { isNpcCharacterId } from '@/esi/entityIds';
import { loadPublicCharacterInfo } from './publicInfoData';

export interface CharacterAchievement {
  score: number;
  titleId: string | null;
}

/** What a line or cell shows. */
export interface AchievementParts {
  title: string | null;
  score: number | null;
}

export function achievementFromPublicInfo(info: CharacterPublicInfo): CharacterAchievement {
  return { score: info.achievement_score ?? 0, titleId: info.character_title_id ?? null };
}

/** Null when neither a named title nor a score > 0. An unnamed or not-yet-loaded title reads as none. */
export function achievementParts(
  achievement: CharacterAchievement,
  titleNames: Readonly<Record<string, string>> | null
): AchievementParts | null {
  const { titleId } = achievement;
  const title =
    titleId !== null && titleNames && Object.hasOwn(titleNames, titleId)
      ? titleNames[titleId]
      : null;
  const score = achievement.score > 0 ? achievement.score : null;
  return title === null && score === null ? null : { title, score };
}

/**
 * The public record's score and title, through the cached loader. An NPC agent
 * has neither, so it is never asked about; a record that cannot be read is null.
 */
export async function loadCharacterAchievement(
  characterId: number
): Promise<CharacterAchievement | null> {
  if (isNpcCharacterId(characterId)) return null;
  try {
    const info = await loadPublicCharacterInfo(characterId);
    return info ? achievementFromPublicInfo(info) : null;
  } catch {
    return null;
  }
}

/** Character contacts only: corps, alliances and factions have no score or title (`loadCharacterAchievement` skips NPC agents). */
export function achievementContactIds(contacts: readonly CharacterContact[]): number[] {
  return contacts
    .filter((contact) => contact.contact_type === 'character')
    .map((contact) => contact.contact_id);
}
