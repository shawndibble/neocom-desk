import { useEffect, useState } from 'react';
import {
  loadSkillCatalog,
  toEngineAttributes,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import { loadCharacterAttributes, loadImplantBonuses } from '@/features/skills/data';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { remapAvailability, type RemapAvailability } from './remapAvailability';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';

const DEFAULT_ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

export interface PlanEditorData {
  catalog: SkillCatalog | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  remapInfo: RemapAvailability | null;
}

/**
 * Inputs shared by the plan list (Current Queue panel, new-plan remap
 * prefill) and the plan editor, loaded once per active character. Both
 * routes call this rather than one owning it and passing it down, since
 * they're siblings, not parent/child, once plan editing has its own route.
 */
export function usePlanEditorData(characterId: number | null): PlanEditorData {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());
  const [attributes, setAttributes] = useState<Attributes>(DEFAULT_ATTRIBUTES);
  const [implants, setImplants] = useState<Implants>({});
  // Remaps Available (CONTEXT.md): ESI bonus remaps + the yearly remap when
  // off cooldown. Prefills new plans' remapCount; user-editable per plan.
  const [remapInfo, setRemapInfo] = useState<RemapAvailability | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, corrected, attrs, implantBonuses] = await Promise.all([
        loadSkillCatalog(),
        loadCorrectedSkills(characterId, Date.now()),
        loadCharacterAttributes(characterId),
        loadImplantBonuses(characterId),
      ]);
      if (cancelled) return;
      setCatalog(cat);
      // /skills is stale until the character next logs in. ESI says to apply
      // past-finish_date queue entries on top, or a plan gets normalized and
      // optimized against levels the character already trained past.
      setTrainedSkills(corrected.trained);
      if (attrs?.data) setAttributes(toEngineAttributes(attrs.data, implantBonuses));
      setRemapInfo(remapAvailability(attrs?.data ?? null, new Date()));
      setImplants(implantBonuses);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return { catalog, trainedSkills, attributes, implants, remapInfo };
}
