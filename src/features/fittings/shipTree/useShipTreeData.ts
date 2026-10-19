/**
 * Everything the Ship Tree tab draws from, loaded once: the tree itself,
 * Masteries, the skill catalog, and the active Character's skills, clone
 * and attributes — plus every hull's status, computed once per change.
 *
 * With no active Character the catalog is still loaded (Alpha caps drive
 * the Ω marks, skill names the bonuses and pirate emblems) and statuses are
 * computed against no trained skills, so the whole tree renders dim. With
 * one, no status is computed until its skills have been read — until then
 * the tree renders dim rather than guessing from an empty skill sheet.
 */
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
  /** Whether `masteries` is the real file (`loaded`), still on its way, or could not be loaded (then it is empty, and a hull's lack of an entry means nothing). */
  masteriesStatus: 'loading' | 'loaded' | 'unavailable';
  /** Tries `masteries.json` again after `unavailable`. */
  retryMasteries: () => void;
  catalog: SkillCatalog;
  characterId: number | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  trainedLevel: (skillTypeID: number) => number;
  alphaMaxLevel: (skillTypeID: number) => number;
  /** A skill's name, or `#id` when the catalog doesn't know it. */
  skillName: (skillTypeID: number) => string;
  /** The active Character's attributes, implants and clone — what a training-time estimate needs. Meaningless with no Character; callers gate on `characterId !== null` first. */
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
}

/**
 * `source` is null until the tree and the skill catalog have both loaded;
 * `'failed'` when either can't be, and then `retry` loads them again (so does
 * the connection coming back).
 */
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
