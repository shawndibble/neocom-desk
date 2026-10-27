/**
 * Joins a Build Plan's (or group's) job tree to the character's real job-slot
 * data: one scheduled job per node on the free slots of its pool, sub-jobs in
 * parallel, and when the whole tree is done if started now. Silent (`null`)
 * whenever slot data isn't known — no industry-jobs scope, no cached skills —
 * never a false "0 free".
 */
import { useEffect, useMemo, useState } from 'react';
import {
  scheduleJobsAcrossCharacters,
  type JobSchedule,
  type ScheduleCharacter,
  type ScheduleNode,
} from '@/engine/industry/jobSchedule';
import {
  jobTimeMultiplier,
  NO_CHARACTER_MODIFIERS,
  type CharacterModifiers,
} from '@/engine/industry/characterModifiers';
import { type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import type { BlueprintSkillRequirement, IndustryActivity } from '@/engine/industry/types';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import {
  jobSlotSkillsFromCharacterSkills,
  toJobSlotJobs,
} from '@/features/character/jobSlotSkills';
import { useCharacters } from '@/features/character/useCharacters';
import { useCharacterModifiersByCharacter } from '@/features/character/characterModifiers';
import { idSetKey } from '@/lib/idSetKey';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { loadCharacterBlueprints } from './data';
import { loadCharacterIndustryJobs } from './jobs';

/** The category a plan's own top-level job draws from. */
export function categoryForActivity(activity: IndustryActivity): JobSlotCategory {
  return activity === 'reaction' ? 'reaction' : 'manufacturing';
}

/** What a job is to the reader: the item the plan (or a group member) makes, a manufactured part, or a reaction. */
export type PlanJobKind = 'final' | 'part' | 'reaction';

export interface PlanJobNode extends ScheduleNode {
  kind: PlanJobKind;
  /** The blueprint this job runs, when the catalog knows it: who can run it. */
  blueprintTypeID?: number;
  activity?: IndustryActivity;
  blueprintSkills?: readonly BlueprintSkillRequirement[];
}

/**
 * One schedule node per job in a plan's tree: the plan's own job (id
 * `<prefix>0`) and every sub-build beneath it, each depending on the
 * sub-builds among its own inputs. A typeID built in two branches is two jobs,
 * as the cost engine prices it. `prefix` keeps ids apart across a group's
 * members.
 */
export function planJobNodes(
  plan: {
    activity: IndustryActivity;
    seconds: number;
    materials: readonly ResolvedMaterial[];
    blueprintTypeID?: number;
  },
  catalog: Pick<BlueprintCatalog, 'byProductTypeID'> &
    Partial<Pick<BlueprintCatalog, 'byBlueprintTypeID'>>,
  prefix = ''
): PlanJobNode[] {
  const nodes: PlanJobNode[] = [];
  let next = 0;
  const add = (
    seconds: number,
    category: JobSlotCategory,
    kind: PlanJobKind,
    inputs: readonly ResolvedMaterial[],
    entry: Pick<BlueprintCatalogEntry, 'blueprintTypeID' | 'blueprint'> | undefined
  ) => {
    const node: PlanJobNode = { id: `${prefix}${next++}`, seconds, category, kind, deps: [] };
    if (entry) {
      node.blueprintTypeID = entry.blueprintTypeID;
      node.activity = entry.blueprint.activity;
      node.blueprintSkills = entry.blueprint.skills;
    }
    nodes.push(node);
    const deps: string[] = [];
    for (const material of inputs) {
      const subBuild = material.subBuild;
      if (!subBuild) continue;
      const subEntry = catalog.byProductTypeID.get(subBuild.typeID);
      const activity = subEntry?.blueprint.activity;
      const subCategory = categoryForActivity(activity ?? 'manufacturing');
      deps.push(
        add(
          subBuild.seconds,
          subCategory,
          subCategory === 'reaction' ? 'reaction' : 'part',
          subBuild.inputs,
          subEntry
        )
      );
    }
    node.deps = deps;
    return node.id;
  };
  const rootEntry =
    plan.blueprintTypeID === undefined
      ? undefined
      : catalog.byBlueprintTypeID?.get(plan.blueprintTypeID);
  add(plan.seconds, categoryForActivity(plan.activity), 'final', plan.materials, rootEntry);
  return nodes;
}

/** What `assignCharacters` needs to know about one Character. */
export interface LaneCharacter {
  characterId: number;
  modifiers: CharacterModifiers;
  /** Blueprint type IDs this Character owns (any copy). */
  blueprintTypeIDs: ReadonlySet<number>;
}

/**
 * Marks which Characters can run each job and how long it takes them. A job
 * is in reach of a Character who owns its blueprint, or of everyone when a
 * corp-owned copy counts (`corpBlueprintTypeIDs`); when nobody listed has it
 * (an assumed, unowned blueprint) it stays with the plan Character, so no job
 * is ever dropped. A Character's time is the node's seconds (baked from the
 * plan Character's skills) rescaled by the ratio of the two Characters'
 * skill-and-implant multipliers; facility, rig and TE terms are the same for
 * both.
 */
export function assignCharacters(
  nodes: readonly PlanJobNode[],
  characters: readonly LaneCharacter[],
  planCharacterId: number,
  corpBlueprintTypeIDs: ReadonlySet<number> = new Set()
): PlanJobNode[] {
  const planCharacter = characters.find((c) => c.characterId === planCharacterId);
  return nodes.map((node) => {
    const activity = node.activity ?? (node.category === 'reaction' ? 'reaction' : 'manufacturing');
    const baseline = planCharacter
      ? jobTimeMultiplier(planCharacter.modifiers, activity, node.blueprintSkills)
      : 1;
    const inReach =
      node.blueprintTypeID === undefined
        ? []
        : characters.filter(
            (c) =>
              corpBlueprintTypeIDs.has(node.blueprintTypeID!) ||
              c.blueprintTypeIDs.has(node.blueprintTypeID!)
          );
    const secondsByCharacter = new Map<number, number>();
    if (inReach.length === 0) {
      secondsByCharacter.set(planCharacterId, node.seconds);
    } else {
      for (const c of inReach) {
        const own = jobTimeMultiplier(c.modifiers, activity, node.blueprintSkills);
        secondsByCharacter.set(
          c.characterId,
          baseline > 0 ? (node.seconds * own) / baseline : node.seconds
        );
      }
    }
    return { ...node, secondsByCharacter };
  });
}

export interface PlanLane {
  characterId: number;
  stages: PlanStage[];
}

/**
 * One lane per Character the schedule gives jobs to, in the order they first
 * work; empty unless two or more Characters share the plan, so a
 * single-Character plan draws no lanes.
 */
export function planLanes(schedule: JobSchedule, nodes: readonly PlanJobNode[]): PlanLane[] {
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind]));
  const byCharacter = new Map<number, Map<number, PlanStage>>();
  const ordered = [...schedule.jobs].sort((a, b) => a.startMs - b.startMs);
  for (const job of ordered) {
    if (job.characterId === undefined) continue;
    const stages = byCharacter.get(job.characterId) ?? new Map<number, PlanStage>();
    byCharacter.set(job.characterId, stages);
    const stage = stages.get(job.stage) ?? {
      startMs: job.startMs,
      counts: { reaction: 0, part: 0, final: 0 },
    };
    stage.startMs = Math.min(stage.startMs, job.startMs);
    stage.counts[kindOf.get(job.id) ?? 'part'] += 1;
    stages.set(job.stage, stage);
  }
  if (byCharacter.size < 2) return [];
  return [...byCharacter].map(([characterId, stages]) => ({
    characterId,
    stages: [...stages].sort(([a], [b]) => a - b).map(([, stage]) => stage),
  }));
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

/** A Character's job-slot skills, queue-corrected; null when skills aren't known (never a guessed zero). */
export async function loadJobSlotSkills(
  characterId: number,
  nowMs: number
): Promise<JobSlotSkills | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, { skipQueueWithoutScope: true });
  if (!corrected.skillsResult) return null;
  return jobSlotSkillsFromCharacterSkills(
    corrected.skillsResult.data.skills,
    corrected.queueResult?.data ?? [],
    nowMs
  );
}

export interface PlanJobSlotData {
  characters: ScheduleCharacter[];
  /** When the jobs and skills were read: the schedule's "now". */
  loadedAtMs: number;
}

/**
 * Every given Character's slot data, or null while loading / when any one
 * Character's jobs (or skills) scope was never granted — so the caller
 * renders nothing at all rather than a schedule that ignores a Character.
 */
export function usePlanJobSlots(characterIds: readonly number[]): PlanJobSlotData | null {
  const key = idSetKey(characterIds);
  const [loaded, setLoaded] = useState<(PlanJobSlotData & { key: string }) | null>(null);

  useEffect(() => {
    if (characterIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const nowMs = Date.now();
        const characters = await Promise.all(
          characterIds.map(async (characterId) => {
            const [jobs, skills] = await Promise.all([
              loadCharacterIndustryJobs(characterId),
              loadJobSlotSkills(characterId, nowMs),
            ]);
            if (jobs.needsReauth || !jobs.cached || !skills) return null;
            return { characterId, jobs: toJobSlotJobs(jobs.cached.data), skills };
          })
        );
        if (cancelled || characters.some((c) => c === null)) return;
        setLoaded({ key, characters: characters as ScheduleCharacter[], loadedAtMs: nowMs });
      } catch {
        // Unknown slot data reads as "no line", never a guessed zero.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity.
  }, [key]);

  return loaded && loaded.key === key ? loaded : null;
}

/** Type IDs of the blueprints each Character owns; a Character whose list can't be read owns none. */
function useOwnedBlueprintTypeIDs(
  characterIds: readonly number[]
): ReadonlyMap<number, ReadonlySet<number>> | null {
  const key = idSetKey(characterIds);
  const [loaded, setLoaded] = useState<{
    key: string;
    byCharacter: ReadonlyMap<number, ReadonlySet<number>>;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      characterIds.map(async (characterId) => {
        try {
          const result = await loadCharacterBlueprints(characterId);
          return [characterId, new Set((result.cached?.data ?? []).map((b) => b.type_id))] as const;
        } catch {
          return [characterId, new Set<number>()] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setLoaded({ key, byCharacter: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity.
  }, [key]);
  return loaded && loaded.key === key ? loaded.byCharacter : null;
}

export interface PlanScheduleResult {
  schedule: JobSchedule;
  stages: PlanStage[];
  /** One per Character when two or more share the plan; empty for a single Character. */
  lanes: PlanLane[];
  nowMs: number;
  /** Sub-jobs are timed at TE 0; the line only notes it when there are some. */
  hasSubJobs: boolean;
}

/**
 * The tree scheduled across every Character on this device: each job goes to
 * a Character with its blueprint in reach and a free slot. Null while any
 * Character's slot data is unknown (the caller falls back to job time and
 * draws no line). With one Character it is that Character's slots alone.
 * `corpBlueprints` are the corp-owned copies in play (the plan's Corp Assets
 * toggle on); they are in reach of every Character.
 */
export function usePlanSchedule(
  planCharacterId: number | null,
  nodes: readonly PlanJobNode[],
  corpBlueprints: readonly { type_id: number }[] = NO_BLUEPRINTS
): PlanScheduleResult | null {
  const characters = useCharacters();
  const characterIds = useMemo(
    () =>
      // No Characters read yet (the live query's empty first answer): wait, so a
      // multi-Character user never sees a line that ignores their other Characters.
      planCharacterId === null || characters.length === 0
        ? []
        : [
            planCharacterId,
            ...characters.map((c) => c.characterId).filter((id) => id !== planCharacterId),
          ],
    [planCharacterId, characters]
  );
  const multi = characterIds.length > 1;
  const data = usePlanJobSlots(characterIds);
  const owned = useOwnedBlueprintTypeIDs(multi ? characterIds : NO_IDS);
  const modifiers = useCharacterModifiersByCharacter(multi ? characterIds : NO_IDS);
  // Scheduled from when the slot data was read, not a ticking clock: the
  // done-by is absolute either way, and a per-minute tick would re-render the
  // whole plan page.
  return useMemo(() => {
    if (!data || nodes.length === 0 || planCharacterId === null) return null;
    let scheduled: readonly PlanJobNode[] = nodes;
    if (multi) {
      if (!owned || !characterIds.every((id) => modifiers.has(id))) return null;
      scheduled = assignCharacters(
        nodes,
        characterIds.map((characterId) => ({
          characterId,
          modifiers: modifiers.get(characterId) ?? NO_CHARACTER_MODIFIERS,
          blueprintTypeIDs: owned.get(characterId) ?? new Set<number>(),
        })),
        planCharacterId,
        new Set(corpBlueprints.map((b) => b.type_id))
      );
    }
    const nowMs = data.loadedAtMs;
    const schedule = scheduleJobsAcrossCharacters(scheduled, data.characters, nowMs);
    return {
      schedule,
      stages: planStages(schedule, nodes),
      lanes: planLanes(schedule, nodes),
      nowMs,
      hasSubJobs: nodes.some((node) => node.kind !== 'final'),
    };
  }, [data, nodes, multi, owned, modifiers, characterIds, planCharacterId, corpBlueprints]);
}

const NO_IDS: readonly number[] = [];
const NO_BLUEPRINTS: readonly { type_id: number }[] = [];
