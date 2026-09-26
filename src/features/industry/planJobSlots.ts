/**
 * Joins a Build Plan's (or group's) job time to the character's real job-slot
 * data: which pool it draws from, how many slots are free, and when it would
 * finish if installed now. Silent (`null`) whenever slot data isn't known —
 * no industry-jobs scope, no cached skills — never a false "0 free".
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  aggregateJobSlotSummary,
  type JobSlotCategory,
  type JobSlotJob,
  type JobSlotSkills,
} from '@/engine/industry/jobSlots';
import type { IndustryActivity } from '@/engine/industry/types';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import {
  jobSlotSkillsFromCharacterSkills,
  toJobSlotJobs,
} from '@/features/character/jobSlotSkills';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadCharacterIndustryJobs } from './jobs';

export interface PlanJobSlotData {
  characterName: string;
  skills: JobSlotSkills;
  jobs: readonly JobSlotJob[];
}

/** The category a plan's own top-level job draws from. */
export function categoryForActivity(activity: IndustryActivity): JobSlotCategory {
  return activity === 'reaction' ? 'reaction' : 'manufacturing';
}

/** Slot-pool demand of a job tree: the top-level job plus every sub-build under it. */
export function countJobsByCategory(
  topActivity: IndustryActivity,
  materials: readonly ResolvedMaterial[],
  catalog: Pick<BlueprintCatalog, 'byProductTypeID'>
): Record<JobSlotCategory, number> {
  const counts: Record<JobSlotCategory, number> = { manufacturing: 0, science: 0, reaction: 0 };
  counts[categoryForActivity(topActivity)] += 1;
  const walk = (list: readonly ResolvedMaterial[]) => {
    for (const material of list) {
      if (!material.subBuild) continue;
      const activity = catalog.byProductTypeID.get(material.subBuild.typeID)?.blueprint.activity;
      counts[categoryForActivity(activity ?? 'manufacturing')] += 1;
      walk(material.subBuild.inputs);
    }
  };
  walk(materials);
  return counts;
}

/** Free slots in one category for one character, or undefined when unknown. */
export function openSlots(
  data: PlanJobSlotData,
  category: JobSlotCategory,
  nowMs: number
): number | undefined {
  return aggregateJobSlotSummary([{ skills: data.skills, jobs: data.jobs }], nowMs)[category]?.open;
}

/**
 * The plan character's slot data, or null while loading / when the jobs (or
 * skills) scope was never granted — so the caller renders nothing at all.
 */
export function usePlanJobSlots(characterId: number): PlanJobSlotData | null {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const [loaded, setLoaded] = useState<{
    characterId: number;
    skills: JobSlotSkills;
    jobs: JobSlotJob[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nowMs = Date.now();
        const [jobs, corrected] = await Promise.all([
          loadCharacterIndustryJobs(characterId),
          loadCorrectedSkills(characterId, nowMs, { skipQueueWithoutScope: true }),
        ]);
        if (cancelled || jobs.needsReauth || !jobs.cached || !corrected.skillsResult) return;
        setLoaded({
          characterId,
          jobs: toJobSlotJobs(jobs.cached.data),
          skills: jobSlotSkillsFromCharacterSkills(
            corrected.skillsResult.data.skills,
            corrected.queueResult?.data ?? [],
            nowMs
          ),
        });
      } catch {
        // Unknown slot data reads as "no line", never a guessed zero.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (!character || !loaded || loaded.characterId !== characterId) return null;
  return { characterName: character.name, skills: loaded.skills, jobs: loaded.jobs };
}
