import { useMemo, useState } from 'react';
import { hullStatuses } from '@/engine/shipTree/status';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { Attributes, CloneState, Implants, TrainedSkill } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import type { SkillCatalog } from '@/features/skills/skillMap';
import { loadShipTree } from '@/sde/loadSde';
import { useMasteries } from '../useMasteries';
import type { MasteryMap, ShipTreeData } from '@/sde/types';
import { shipTreeSkillCatalog } from './shipTreeCatalogs';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';

const NO_TRAINED: ReadonlyMap<number, TrainedSkill> = new Map();
const NO_STATUSES: ReadonlyMap<number, ShipTreeHullStatus> = new Map();
const NO_MASTERIES: MasteryMap = {};

const loadTreeAndCatalog = () =>
  Promise.all([loadShipTree(), shipTreeSkillCatalog()]).then(([tree, skills]) => ({
    tree,
    skills,
  }));

export interface ShipTreeSource {
  data: ShipTreeData;
  masteries: MasteryMap;
  masteriesStatus: 'loading' | 'loaded' | 'unavailable';
  retryMasteries: () => void;
  catalog: SkillCatalog;
  characterId: number | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  trainedLevel: (skillTypeID: number) => number;
  alphaMaxLevel: (skillTypeID: number) => number;
  skillName: (skillTypeID: number) => string;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
}

export function useShipTreeData(characterId: number | null): {
  source: ShipTreeSource | null | 'failed';
  retry: () => void;
} {
  const loaded = useAsyncLoad(loadTreeAndCatalog);
  const { retry } = loaded;
  const data = loaded.data?.tree ?? null;
  const catalog = loaded.data?.skills ?? null;
  const failed = loaded.status === 'failed';
  const masteriesState = useMasteries();
  const masteries = masteriesState.status === 'loaded' ? masteriesState.masteries : NO_MASTERIES;
  const masteriesStatus = masteriesState.status;
  const retryMasteries = masteriesState.retry;
  const editor = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  const [now] = useState(() => new Date());

  useHydratedStore(useCloneStates);

  const trainedSkills = characterId === null ? NO_TRAINED : editor.trainedSkills;
  const cloneState: CloneState =
    characterId === null ? 'omega' : cloneStateFor(cloneStates, characterId);
  const { attributes, implants } = editor;
  const skillsRead = characterId === null || editor.trainedSkillsKnown;

  const statuses = useMemo(() => {
    if (!data || !catalog || !skillsRead) return NO_STATUSES;
    return hullStatuses(data.ships, masteries, {
      skills: catalog.engineSkills,
      trainedSkills,
      attributes,
      implants,
      cloneState,
      now,
    });
  }, [data, catalog, skillsRead, masteries, trainedSkills, attributes, implants, cloneState, now]);

  const source = useMemo(() => {
    if (!data || !catalog) return null;
    return {
      data,
      masteries,
      masteriesStatus,
      retryMasteries,
      catalog,
      characterId,
      trainedSkills,
      statuses,
      trainedLevel: (id: number) => trainedSkills.get(id)?.level ?? 0,
      alphaMaxLevel: (id: number) => catalog.engineSkills.get(id)?.alphaMaxLevel ?? 0,
      skillName: (id: number) => catalog.bySkillTypeID.get(id)?.name ?? `#${id}`,
      attributes,
      implants,
      cloneState,
    };
  }, [
    data,
    masteries,
    masteriesStatus,
    retryMasteries,
    catalog,
    characterId,
    trainedSkills,
    statuses,
    attributes,
    implants,
    cloneState,
  ]);
  return { source: failed ? 'failed' : source, retry };
}
