/**
 * Joins a Build Plan's (or group's) job tree to the character's real job-slot
 * data: one scheduled job per node on the free slots of its pool, sub-jobs in
 * parallel, and when the whole tree is done if started now. Silent (`null`)
 * whenever slot data isn't known — no industry-jobs scope, no cached skills —
 * never a false "0 free".
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { scheduleJobs, type JobSchedule, type ScheduleNode } from '@/engine/industry/jobSchedule';
import {
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
import { eveClock, formatEveDateTime } from '@/lib/eveTime';
import { useNow } from '@/lib/useNow';
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

/** What a job is to the reader: the item the plan (or a group member) makes, a manufactured part, or a reaction. */
export type PlanJobKind = 'final' | 'part' | 'reaction';

export interface PlanJobNode extends ScheduleNode {
  kind: PlanJobKind;
}

/**
 * One schedule node per job in a plan's tree: the plan's own job (id
 * `<prefix>0`) and every sub-build beneath it, each depending on the
 * sub-builds among its own inputs. A typeID built in two branches is two jobs,
 * as the cost engine prices it. `prefix` keeps ids apart across a group's
 * members.
 */
export function planJobNodes(
  plan: { activity: IndustryActivity; seconds: number; materials: readonly ResolvedMaterial[] },
  catalog: Pick<BlueprintCatalog, 'byProductTypeID'>,
  prefix = ''
): PlanJobNode[] {
  const nodes: PlanJobNode[] = [];
  let next = 0;
  const add = (
    seconds: number,
    category: JobSlotCategory,
    kind: PlanJobKind,
    inputs: readonly ResolvedMaterial[]
  ) => {
    const node: PlanJobNode = { id: `${prefix}${next++}`, seconds, category, kind, deps: [] };
    nodes.push(node);
    const deps: string[] = [];
    for (const material of inputs) {
      const subBuild = material.subBuild;
      if (!subBuild) continue;
      const activity = catalog.byProductTypeID.get(subBuild.typeID)?.blueprint.activity;
      const subCategory = categoryForActivity(activity ?? 'manufacturing');
      deps.push(
        add(
          subBuild.seconds,
          subCategory,
          subCategory === 'reaction' ? 'reaction' : 'part',
          subBuild.inputs
        )
      );
    }
    node.deps = deps;
    return node.id;
  };
  add(plan.seconds, categoryForActivity(plan.activity), 'final', plan.materials);
  return nodes;
}

export interface PlanStage {
  startMs: number;
  counts: Record<PlanJobKind, number>;
}

/** The schedule's stages counted by kind: "Now: 4 reactions · Wed 09:00: 6 parts · …". */
export function planStages(schedule: JobSchedule, nodes: readonly PlanJobNode[]): PlanStage[] {
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind]));
  return schedule.stages.map((stage) => {
    const counts: Record<PlanJobKind, number> = { reaction: 0, part: 0, final: 0 };
    for (const id of stage.jobIds) counts[kindOf.get(id) ?? 'part'] += 1;
    return { startMs: stage.startMs, counts };
  });
}

const WEEK_MS = 7 * 86_400_000;

/** "Thu 14:20" EVE time while the weekday is unambiguous (under a week out), else "10-23 14:20". */
export function scheduleWhen(ms: number, nowMs: number): string {
  return ms - nowMs < WEEK_MS ? eveClock(ms) : formatEveDateTime(new Date(ms));
}

/**
 * The plan character's slot data, or null while loading / when the jobs (or
 * skills) scope was never granted — so the caller renders nothing at all.
 */
export function usePlanJobSlots(characterId: number | null): PlanJobSlotData | null {
  const character = useLiveQuery(
    () => (characterId === null ? undefined : db.characters.get(characterId)),
    [characterId]
  );
  const [loaded, setLoaded] = useState<{
    characterId: number;
    skills: JobSlotSkills;
    jobs: JobSlotJob[];
  } | null>(null);

  useEffect(() => {
    if (characterId === null) return;
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

  const characterName = character?.name;
  return useMemo(
    () =>
      characterName === undefined || !loaded || loaded.characterId !== characterId
        ? null
        : { characterName, skills: loaded.skills, jobs: loaded.jobs },
    [characterName, loaded, characterId]
  );
}

export interface PlanScheduleResult {
  schedule: JobSchedule;
  stages: PlanStage[];
  nowMs: number;
}

/**
 * The plan (or group) tree scheduled on the character's slots right now, or
 * null while slot data is unknown — the caller then falls back to job time
 * and draws no slot line.
 */
export function usePlanSchedule(
  characterId: number | null,
  nodes: readonly PlanJobNode[]
): PlanScheduleResult | null {
  const data = usePlanJobSlots(characterId);
  const nowMs = useNow();
  return useMemo(() => {
    if (!data || nodes.length === 0) return null;
    const schedule = scheduleJobs(nodes, data, nowMs);
    return { schedule, stages: planStages(schedule, nodes), nowMs };
  }, [data, nodes, nowMs]);
}
