import { loadCharacterSkillQueueWithStatus } from '@/features/skills/data';
import { projectSkillQueue } from '@/engine/projection';
import { loadSkills } from '@/sde/loadSde';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type {
  NotificationFire,
  SkillQueueEntrySnapshot,
  SkillQueueSnapshot,
} from '@/engine/notificationDiffs';
import { skillQueueCopy, type SkillNames } from '../domainCopy';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds, resolveProjectionNames, universeTypeName } from './shared';

const isSkillQueueEntrySnapshot = shapeGuard<SkillQueueEntrySnapshot>({
  skillId: is.number,
  finishedLevel: is.number,
  queuePosition: is.number,
  finishMs: is.nullable(is.number),
  endingLeadMs: is.optional(is.number),
});

function toSkillQueueEntrySnapshot(
  entry: SkillQueueEntry,
  endingLeadMs: number
): SkillQueueEntrySnapshot {
  const finishMs = entry.finish_date ? Date.parse(entry.finish_date) : NaN;
  return {
    skillId: entry.skill_id,
    finishedLevel: entry.finished_level,
    queuePosition: entry.queue_position,
    finishMs: Number.isFinite(finishMs) ? finishMs : null,
    endingLeadMs,
  };
}

async function skillName(skillId: number): Promise<string | null> {
  const skills = await loadSkills().catch(() => []);
  return skills.find((skill) => skill.typeID === skillId)?.name ?? universeTypeName(skillId);
}

export const skillQueueDomain = defineDomain<
  SkillQueueEntrySnapshot,
  SkillQueueSnapshot,
  NotificationFire,
  SkillNames
>({
  source: SNAPSHOT_SOURCES.skillQueue,
  stateKey: 'notifications.pollerState.skillQueue',
  entriesKey: 'entries',
  isEntry: isSkillQueueEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterSkillQueueWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const endingLeadMs = (await currentThresholds(characterId)).skillQueueEndingLeadHours * HOUR_MS;
    return result.cached.data.map((entry) => toSkillQueueEntrySnapshot(entry, endingLeadMs));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const endingLeadMs = (await currentThresholds(characterId)).skillQueueEndingLeadHours * HOUR_MS;
    const entries = snapshot.entries.map((entry) => ({ ...entry, endingLeadMs }));
    const skillNames = await resolveProjectionNames(
      entries.map((entry) => entry.skillId),
      skillName
    );
    return projectSkillQueue(
      characterId,
      characterName,
      entries,
      skillNames,
      skillQueueCopy.push,
      nowMs
    );
  },
  names: async (fire) => ({
    skill: fire.skillId === null ? undefined : ((await skillName(fire.skillId)) ?? undefined),
  }),
});
