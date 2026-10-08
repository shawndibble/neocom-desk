import type { CloneInput, QueueEntryInput } from '@/engine/cloneTrainingTime';
import { acceleratorBonusOf, baselineAttributes } from '@/engine/attributeBaseline';
import type { Attributes, EngineSkill, Implants } from '@/engine/types';
import type { JumpClone, SkillQueueEntry } from '@/esi/endpoints';
import { classifySkillQueue, isQueuePaused } from '@/features/skills/queueStatus';
import { extractAttributeBonuses, sumAttributeBonuses } from '@/features/skills/dogma';
import { loadCharacterAttributes, loadUniverseType } from '@/features/skills/data';
import { loadSkillCatalog, toAttributeBaseline } from '@/features/skills/skillMap';

/** Id of the clone the Character is wearing; jump clones keep their own ids. */
export const WORN_CLONE_ID = 'worn';

/** Everything `cloneVerdict` needs, read once per load. */
export interface CloneTrainingData {
  queue: QueueEntryInput[];
  paused: boolean;
  baseAttributes: Attributes;
  /** The worn clone first (`WORN_CLONE_ID`), then each jump clone by `jump_clone_id`. */
  clones: CloneInput[];
  /** Skill names for the bar legend, keyed by type id. */
  skillNames: Map<number, string>;
}

/**
 * The queue's remaining work, in training order. Finished rows are dropped. A
 * row the verdict cannot size (unknown skill, no end SP) makes the whole queue
 * null: a partial queue would give a confidently wrong verdict.
 */
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
      // Part-way through the running level: the SP already banked is not left to train.
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

async function implantBonuses(typeIds: readonly number[]): Promise<Implants> {
  const types = await Promise.all(typeIds.map((id) => loadUniverseType(id)));
  return sumAttributeBonuses(types.map((t) => extractAttributeBonuses(t?.data?.dogma_attributes)));
}

/**
 * Null when the verdict cannot be built honestly: no readable attribute sheet
 * (or one that no allocation explains), or a skill the SDE does not know.
 * Every clone stays in the comparison, a bare one included.
 */
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
    implantBonuses(input.wornImplantIds),
    Promise.all(input.jumpClones.map((c) => implantBonuses(c.implants))),
  ]);
  if (!attrs?.data) return null;
  const baseline = toAttributeBaseline(attrs.data, worn);
  const sheet = baselineAttributes(baseline);
  if (!sheet) return null;
  // A cerebral accelerator rides along in every clone, so it belongs in the base.
  const boost = acceleratorBonusOf(baseline);
  const baseAttributes: Attributes = {
    intelligence: sheet.intelligence + boost,
    memory: sheet.memory + boost,
    perception: sheet.perception + boost,
    willpower: sheet.willpower + boost,
    charisma: sheet.charisma + boost,
  };
  const paused = isQueuePaused(input.queue);
  // A paused queue has no dates to size and is reported as paused, never compared.
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
