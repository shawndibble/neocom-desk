import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { projectIndustryJobs } from '@/engine/projection';
import type { IndustryJob } from '@/esi/endpoints';
import type {
  IndustryJobEntrySnapshot,
  IndustryJobNotificationFire,
  IndustryJobSnapshot,
} from '@/engine/notificationDiffs';
import { industryItemTypeId, type ItemNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { resolveProjectionNames, typeNameOrAbsent, universeTypeName } from './shared';

/* Industry jobs -------------------------------------------------------------- */

const isIndustryJobEntrySnapshot = shapeGuard<IndustryJobEntrySnapshot>({
  jobId: is.number,
  endMs: is.number,
  blueprintTypeId: is.number,
  productTypeId: is.nullable(is.number),
  activityId: is.number,
});

function toIndustryJobEntrySnapshot(job: IndustryJob): IndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

export const industryJobDomain = defineDomain<
  IndustryJob,
  IndustryJobSnapshot,
  IndustryJobNotificationFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.industryJobs,
  stateKey: 'notifications.pollerState.industryJobs',
  entriesKey: 'entries',
  isEntry: isIndustryJobEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterIndustryJobs(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (jobs, nowMs) => ({ entries: jobs.map(toIndustryJobEntrySnapshot), nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const itemNames = await resolveProjectionNames(
      snapshot.entries.map((entry) => entry.productTypeId ?? entry.blueprintTypeId),
      universeTypeName
    );
    return projectIndustryJobs(
      characterId,
      characterName,
      snapshot.entries,
      itemNames,
      NOTIFICATION_EVENT_ENTRIES.industryJobComplete.projection.push,
      nowMs
    );
  },
  names: async (fire) => ({ item: await typeNameOrAbsent(industryItemTypeId(fire)) }),
});
