import { useEffect, useState } from 'react';
import {
  loadSkillCatalog,
  toAttributeBaseline,
  type SkillCatalog,
} from '@/features/skills/skillMap';
import { baselineAttributes, type AttributeBaseline } from '@/engine/attributeBaseline';
import {
  loadCharacterAttributes,
  loadImplantBonuses,
  type CachedResult,
} from '@/features/skills/data';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { remapAvailability, type RemapAvailability } from './remapAvailability';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import type { CharacterAttributes } from '@/esi/endpoints';

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
  /** Base attributes (implant bonuses removed) — what the scheduler costs against. */
  attributes: Attributes;
  /**
   * ESI's own reading (with its `fetchedAt`, for a `DataAgeBadge`), or null
   * when it could not be read. `attributes` above falls back to
   * DEFAULT_ATTRIBUTES so the scheduler always has numbers to work with;
   * anything *displaying* the character's sheet reads this instead, or it
   * presents that fallback as fact.
   */
  attributesResult: CachedResult<CharacterAttributes> | null;
  /**
   * How `attributes` was arrived at: already a legal allocation, an inflated
   * sheet a cerebral accelerator explains, or one nothing explains. Null until
   * ESI has been read at all — the placeholder sheet above is not a finding
   * about the character, so it must not be reported as one.
   */
  attributeBaseline: AttributeBaseline | null;
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
  const [attributesResult, setAttributesResult] =
    useState<CachedResult<CharacterAttributes> | null>(null);
  const [attributeBaseline, setAttributeBaseline] = useState<AttributeBaseline | null>(null);
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
      if (attrs?.data) {
        // An `impossible` sheet yields no baseline at all, so the scheduler
        // falls back to the same placeholder it uses when ESI cannot be read.
        // Approximating one from the reported numbers is what produced the
        // silent zero this replaces: see engine/attributeBaseline.ts.
        const baseline = toAttributeBaseline(attrs.data, implantBonuses);
        setAttributeBaseline(baseline);
        setAttributes(baselineAttributes(baseline) ?? DEFAULT_ATTRIBUTES);
      }
      setAttributesResult(attrs);
      setRemapInfo(remapAvailability(attrs?.data ?? null, new Date()));
      setImplants(implantBonuses);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return {
    catalog,
    trainedSkills,
    attributes,
    attributesResult,
    attributeBaseline,
    implants,
    remapInfo,
  };
}
