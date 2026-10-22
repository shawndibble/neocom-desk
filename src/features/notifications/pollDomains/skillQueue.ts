import { loadCharacterSkillQueueWithStatus } from '@/features/skills/data';
import { projectSkillQueue } from '@/engine/projection';
import { loadSkills } from '@/sde/loadSde';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type {
  NotificationFire,
  SkillQueueEntrySnapshot,
  SkillQueueSnapshot,
} from '@/engine/notificationDiffs';
import type { SkillNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds, resolveProjectionNames, universeTypeName } from './shared';

/* Skill queue ---------------------------------------------------------------- */

const isSkillQueueEntrySnapshot = shapeGuard<SkillQueueEntrySnapshot>({
  skillId: is.number,
  finishedLevel: is.number,
  queuePosition: is.number,
  finishMs: is.nullable(is.number),
  // Optional in storage as well as on the wire: every snapshot written
  // before `diffSkillQueueEnding` needed `endingLeadMs` (issue #1410) lacks
  // the field, and those must stay readable rather than being discarded as a
  // stale shape on the first poll after an update — the same
  // `ColonyExtractorSnapshot.installTimeMs` precedent.
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

/**
 * A skill's name from the bundled SDE first — no network, so a transient ESI
 * failure at fire time can't bake a bare `#3405` into the alert — then ESI for
 * a skill newer than the pinned SDE.
 */
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
  // The baseline's baked-in `endingLeadMs` stays as the diff needs it (the
  // setting in force at load time); the Projection instead uses the current
  // lead time, so a Settings change rebuilt from that baseline (issue #1248,
  // `projectionRebuild.ts`) projects the new warning time, not the old one —
  // the same split `colonyDomain.projection` documents in full.
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
      (fire, character, names) =>
        NOTIFICATION_EVENT_ENTRIES[fire.eventId].projection.push(fire, character, names),
      nowMs
    );
  },
  names: async (fire) => ({
    skill: fire.skillId === null ? undefined : ((await skillName(fire.skillId)) ?? undefined),
  }),
});
