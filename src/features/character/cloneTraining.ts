import type { CloneInput, QueueEntryInput } from '@/engine/clone/cloneTrainingTime';
import { acceleratorBonusOf, baselineAttributes } from '@/engine/attributeBaseline';
import type { Attributes, EngineSkill } from '@/engine/types';
import type { JumpClone, SkillQueueEntry } from '@/esi/endpoints';
import { classifySkillQueue, isQueuePaused } from '@/engine/skills/queueStatus';
import { loadCharacterAttributes } from '@/features/skills/data';
import { loadImplantTypeBonuses } from '@/features/skills/typeDetail';
import { loadSkillCatalog, toAttributeBaseline } from '@/features/skills/skillMap';

export const WORN_CLONE_ID = 'worn';

export interface CloneTrainingData {
  queue: QueueEntryInput[];
  paused: boolean;
  baseAttributes: Attributes;
  clones: CloneInput[];
  skillNames: Map<number, string>;
}

export function queueEntryInputs(
  queue: readonly SkillQueueEntry[],
  nowMs: number,
  skills: ReadonlyMap<number, Pick<EngineSkill, 'primary' | 'secondary'>>
): QueueEntryInput[] | null {
  const out: QueueEntryInput[] = [];
  for (const { entry, status } of classifySkillQueue(queue, nowMs)) {
    if (status === 'completed') continue;
    const skill = skills.get(entry.skill_id);
    const end = entry.level_end_sp;
    if (!skill || end === undefined) return null;
    let from = entry.training_start_sp ?? entry.level_start_sp ?? end;
    if (status === 'training' && entry.start_date && entry.finish_date) {
      const start = Date.parse(entry.start_date);
      const finish = Date.parse(entry.finish_date);
      const window = finish - start;
      if (Number.isFinite(window) && window > 0) {
        const fraction = Math.min(Math.max((nowMs - start) / window, 0), 1);
        from = from + (end - from) * fraction;
      }
    }
    out.push({
      skillTypeID: entry.skill_id,
      remainingSp: Math.max(0, end - from),
      primary: skill.primary,
      secondary: skill.secondary,
    });
  }
  return out;
}

export async function loadCloneTrainingData(
  characterId: number,
  nowMs: number,
  input: {
    jumpClones: readonly JumpClone[];
    wornImplantIds: readonly number[];
    queue: readonly SkillQueueEntry[];
  }
): Promise<CloneTrainingData | null> {
  const [catalog, attrs, worn, jumps] = await Promise.all([
    loadSkillCatalog(),
    loadCharacterAttributes(characterId),
    loadImplantTypeBonuses(input.wornImplantIds),
    Promise.all(input.jumpClones.map((c) => loadImplantTypeBonuses(c.implants))),
  ]);
  if (!attrs?.data) return null;
  const baseline = toAttributeBaseline(attrs.data, worn);
  const sheet = baselineAttributes(baseline);
  if (!sheet) return null;
  const boost = acceleratorBonusOf(baseline);
  const baseAttributes: Attributes = {
    intelligence: sheet.intelligence + boost,
    memory: sheet.memory + boost,
    perception: sheet.perception + boost,
    willpower: sheet.willpower + boost,
    charisma: sheet.charisma + boost,
  };
  const paused = isQueuePaused(input.queue);
  const queue = paused ? [] : queueEntryInputs(input.queue, nowMs, catalog.engineSkills);
  if (!queue) return null;
  const skillNames = new Map<number, string>();
  for (const e of queue) {
    const name = catalog.bySkillTypeID.get(e.skillTypeID)?.name;
    if (name) skillNames.set(e.skillTypeID, name);
  }
  return {
    queue,
    paused,
    baseAttributes,
    clones: [
      { id: WORN_CLONE_ID, implants: worn },
      ...input.jumpClones.map((c, i) => ({ id: c.jump_clone_id, implants: jumps[i] })),
    ],
    skillNames,
  };
}
