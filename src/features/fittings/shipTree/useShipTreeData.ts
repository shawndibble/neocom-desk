/**
 * Everything the Ship Tree tab draws from, loaded once: the tree itself,
 * Masteries, the skill catalog, and the active Character's skills, clone
 * and attributes — plus every hull's status, computed once per change.
 *
 * With no active Character the catalog is still loaded (Alpha caps drive
 * the Ω marks, skill names the bonuses and pirate emblems) and statuses are
 * computed against no trained skills, so the whole tree renders dim.
 */
import { useEffect, useMemo, useState } from 'react';
import { hullStatuses } from '@/engine/shipTree/status';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { CloneState, TrainedSkill } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { loadMasteries, loadShipTree } from '@/sde/loadSde';
import type { MasteryMap, ShipTreeData } from '@/sde/types';

const NO_TRAINED: ReadonlyMap<number, TrainedSkill> = new Map();
const NO_STATUSES: ReadonlyMap<number, ShipTreeHullStatus> = new Map();
const NO_MASTERIES: MasteryMap = {};

export interface ShipTreeSource {
  data: ShipTreeData;
  masteries: MasteryMap;
  catalog: SkillCatalog;
  characterId: number | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  trainedLevel: (skillTypeID: number) => number;
  alphaMaxLevel: (skillTypeID: number) => number;
  /** A skill's name, or `#id` when the catalog doesn't know it. */
  skillName: (skillTypeID: number) => string;
}

/** Null until the tree and the skill catalog have both loaded. */
export function useShipTreeData(characterId: number | null): ShipTreeSource | null {
  const [data, setData] = useState<ShipTreeData | null>(null);
  const [masteries, setMasteries] = useState<MasteryMap>(NO_MASTERIES);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const editor = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadShipTree(), loadSkillCatalog()]).then(([tree, skills]) => {
      if (cancelled) return;
      setData(tree);
      setCatalog(skills);
    });
    void loadMasteries().then((m) => {
      if (!cancelled) setMasteries(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    void hydrateCloneStates();
  }, [hydrateCloneStates]);

  const trainedSkills = characterId === null ? NO_TRAINED : editor.trainedSkills;
  const cloneState: CloneState =
    characterId === null ? 'omega' : cloneStateFor(cloneStates, characterId);
  const { attributes, implants } = editor;

  const statuses = useMemo(() => {
    if (!data || !catalog) return NO_STATUSES;
    return hullStatuses(data.ships, masteries, {
      skills: catalog.engineSkills,
      trainedSkills,
      attributes,
      implants,
      cloneState,
      now,
    });
  }, [data, catalog, masteries, trainedSkills, attributes, implants, cloneState, now]);

  return useMemo(() => {
    if (!data || !catalog) return null;
    return {
      data,
      masteries,
      catalog,
      characterId,
      trainedSkills,
      statuses,
      trainedLevel: (id: number) => trainedSkills.get(id)?.level ?? 0,
      alphaMaxLevel: (id: number) => catalog.engineSkills.get(id)?.alphaMaxLevel ?? 0,
      skillName: (id: number) => catalog.bySkillTypeID.get(id)?.name ?? `#${id}`,
    };
  }, [data, masteries, catalog, characterId, trainedSkills, statuses]);
}
