import type { CharacterContact, CharacterPublicInfo } from '@/esi/endpoints';
import { isNpcCharacterId } from '@/esi/entityIds';
import { loadPublicCharacterInfo } from './publicInfoData';

export interface CharacterAchievement {
  score: number;
  titleId: string | null;
}

export interface AchievementParts {
  title: string | null;
  score: number | null;
}

export function achievementFromPublicInfo(info: CharacterPublicInfo): CharacterAchievement {
  return { score: info.achievement_score ?? 0, titleId: info.character_title_id ?? null };
}

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

export function achievementContactIds(contacts: readonly CharacterContact[]): number[] {
  return contacts
    .filter((contact) => contact.contact_type === 'character')
    .map((contact) => contact.contact_id);
}
