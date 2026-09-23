/**
 * The one feature-side place that gathers a Character's snapshot — corrected
 * trained skills plus active-clone implants — and turns it into Character
 * Modifiers (issue #1284). Every pricing surface loads through this, so a new
 * bonus lands once in `src/engine/industry/characterModifiers.ts` and reaches
 * all of them.
 */
import { characterModifiers, type CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { SkillLevels } from '@/engine/industry/types';
import {
  loadCorrectedSkills,
  type LoadCorrectedSkillsOptions,
} from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';

export interface LoadCharacterModifiersOptions extends LoadCorrectedSkillsOptions {
  /**
   * `'effective'` = min(trained, active), issue #1236's rule — what Industry
   * uses. `'trained'` (default) = queue-corrected trained level, what the
   * market/refining surfaces have always read.
   */
  levels?: 'trained' | 'effective';
}

export async function loadCharacterModifiers(
  characterId: number,
  nowMs: number,
  { levels = 'trained', ...options }: LoadCharacterModifiersOptions = {}
): Promise<CharacterModifiers> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, nowMs, options),
    loadCharacterImplants(characterId),
  ]);
  // /skills lags until the character logs in; completed queue entries are
  // the difference, which `loadCorrectedSkills` already folds in.
  const skills: SkillLevels = {};
  if (levels === 'effective') {
    for (const [skillId, level] of corrected.effective) skills[skillId] = level;
  } else {
    for (const [skillId, trained] of corrected.trained) skills[skillId] = trained.level;
  }
  return characterModifiers({ skills, implantTypeIds: implants?.data ?? [] });
}
