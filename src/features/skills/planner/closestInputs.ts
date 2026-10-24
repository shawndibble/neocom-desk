import { baselineAttributes } from '@/engine/attributeBaseline';
import { db } from '@/db';
import type { CharacterTimingInput } from '@/engine/skills/planTimeToFinish';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterAttributes, loadCharacterImplants } from '@/features/skills/data';
import { toAttributeBaseline } from '@/features/skills/skillMap';
import { loadImplantTypeBonuses } from '@/features/skills/typeDetail';
import {
  SYNCED_CLONE_STATES_KEY,
  cloneStateFor,
  parseCloneStates,
} from '@/features/skills/cloneState';
import { resolvePlanBoosters, toBoosters } from './planBooster';

/**
 * One Character's timing inputs for "Who's closest", read from ESI's cache
 * and Dexie. The live queue is applied only as the correction `/skills`
 * needs (levels it has finished); it never delays the start. A read that
 * fails is `unavailable` with its reason, never an empty skill list.
 */
export async function loadClosestInputs(
  characterId: number,
  nowMs: number
): Promise<CharacterTimingInput> {
  try {
    const [corrected, attrs, implantIds, cloneRecord] = await Promise.all([
      loadCorrectedSkills(characterId, nowMs),
      loadCharacterAttributes(characterId),
      loadCharacterImplants(characterId),
      db.settings.get(SYNCED_CLONE_STATES_KEY),
    ]);
    if (corrected.skillsResult === null) {
      return {
        kind: 'unavailable',
        reason: corrected.skillsNeedsReauth ? 'skills-permission' : 'skills-failed',
      };
    }
    if (!attrs?.data) return { kind: 'unavailable', reason: 'attributes-unavailable' };
    if (!implantIds) return { kind: 'unavailable', reason: 'implants-unavailable' };
    const implants = await loadImplantTypeBonuses(implantIds.data);
    const baseline = toAttributeBaseline(attrs.data, implants);
    const attributes = baseline && baselineAttributes(baseline);
    if (!attributes) return { kind: 'unavailable', reason: 'attributes-unavailable' };
    const accelerator = baseline.kind === 'accelerated' ? baseline.acceleratorBonus : null;
    return {
      kind: 'ready',
      trained: corrected.trained,
      attributes,
      implants,
      boosters: toBoosters(resolvePlanBoosters(undefined, undefined, accelerator)),
      cloneState: cloneStateFor(parseCloneStates(cloneRecord?.value), characterId),
    };
  } catch {
    return { kind: 'unavailable', reason: 'skills-failed' };
  }
}
