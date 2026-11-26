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

export function categoryForActivity(activity: IndustryActivity): JobSlotCategory {
  return activity === 'reaction' ? 'reaction' : 'manufacturing';
}

export type PlanJobKind = 'final' | 'part' | 'reaction';

export interface PlanJobNode extends ScheduleNode {
  kind: PlanJobKind;
  blueprintTypeID?: number;
  activity?: IndustryActivity;
  blueprintSkills?: readonly BlueprintSkillRequirement[];
}

export function planJobNodes(
  plan: {
    activity: IndustryActivity;
    seconds: number;
    jobRuns?: readonly number[];
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
    jobRuns: readonly number[] | undefined,
    category: JobSlotCategory,
    kind: PlanJobKind,
    inputs: readonly ResolvedMaterial[],
    entry: Pick<BlueprintCatalogEntry, 'blueprintTypeID' | 'blueprint'> | undefined
  ): string[] => {
    const split = jobRuns !== undefined && jobRuns.length > 1;
    const jobs = (split ? jobRuns : [undefined]).map((runs) => {
      const node: PlanJobNode = {
        id: `${prefix}${next++}`,
        seconds: runs === undefined ? seconds : (seconds * runs) / jobRuns![0],
        category,
        kind,
        deps: [],
      };
      if (entry) {
        node.blueprintTypeID = entry.blueprintTypeID;
        node.activity = entry.blueprint.activity;
        node.blueprintSkills = entry.blueprint.skills;
      }
      nodes.push(node);
      return node;
    });
    const deps: string[] = [];
    for (const material of inputs) {
      const subBuild = material.subBuild;
      if (!subBuild) continue;
      const subEntry = catalog.byProductTypeID.get(subBuild.typeID);
      const activity = subEntry?.blueprint.activity;
      const subCategory = categoryForActivity(activity ?? 'manufacturing');
      deps.push(
        ...add(
          subBuild.seconds,
          subBuild.jobRuns,
          subCategory,
          subCategory === 'reaction' ? 'reaction' : 'part',
          subBuild.inputs,
          subEntry
        )
      );
    }
    for (const node of jobs) node.deps = deps;
    return jobs.map((node) => node.id);
  };
  const rootEntry =
    plan.blueprintTypeID === undefined
      ? undefined
      : catalog.byBlueprintTypeID?.get(plan.blueprintTypeID);
  add(
    plan.seconds,
    plan.jobRuns,
    categoryForActivity(plan.activity),
    'final',
    plan.materials,
    rootEntry
  );
  return nodes;
}

export interface LaneCharacter {
  characterId: number;
  modifiers: CharacterModifiers;
  blueprintTypeIDs: ReadonlySet<number>;
}

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

export function planStages(schedule: JobSchedule, nodes: readonly PlanJobNode[]): PlanStage[] {
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind]));
  return schedule.stages.map((stage) => {
    const counts: Record<PlanJobKind, number> = { reaction: 0, part: 0, final: 0 };
    for (const id of stage.jobIds) counts[kindOf.get(id) ?? 'part'] += 1;
    return { startMs: stage.startMs, counts };
  });
}

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
  loadedAtMs: number;
}

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
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity.
  }, [key]);

  return loaded && loaded.key === key ? loaded : null;
}

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
  lanes: PlanLane[];
  nowMs: number;
  hasSubJobs: boolean;
}

export function usePlanSchedule(
  planCharacterId: number | null,
  nodes: readonly PlanJobNode[],
  corpBlueprints: readonly { type_id: number }[] = NO_BLUEPRINTS
): PlanScheduleResult | null {
  const characters = useCharacters();
  const characterIds = useMemo(
    () =>
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
