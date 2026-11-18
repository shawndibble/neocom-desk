/**
 * Required-skills-to-use for the order row expand (`OrderDetailPanel`) — the
 * same section and the same fetch `ItemDetailModal` already does for "Show
 * Info", read once per selected item here instead of once per opened row:
 * every order in the book is the same item, so the answer is identical for
 * all of them. Bundled with the character's trained skills and the target
 * plan, since all three feed that one panel together.
 */
import { useCallback } from 'react';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadAttributeReferenceNames } from '@/features/market/attributeReferenceNames';
import { extractRequiredSkills, type RequiredSkill } from '@/features/skills/dogma';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { useTargetPlan, type TargetPlan } from '@/features/skills/useTargetPlan';
import type { TrainedSkill } from '@/engine/types';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface ItemSkills {
  typeId: number;
  requiredSkills: RequiredSkill[];
  skillNames: Readonly<Record<number, string>>;
}

export interface OrderRowSkills {
  itemSkills: ItemSkills | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  targetPlan: TargetPlan;
}

const NO_TRAINED_SKILLS: ReadonlyMap<number, TrainedSkill> = new Map();

export function useOrderRowSkills(
  selectedTypeId: number | null,
  activeCharacterId: number | null
): OrderRowSkills {
  // A nice-to-have fetch for a row-expand section that renders nothing while
  // `itemSkills` is null, so a failure just leaves it out.
  const loadItemSkills = useCallback(async (): Promise<ItemSkills | null> => {
    const [type, dictionary] = await Promise.all([
      loadTypeDetail(selectedTypeId ?? 0),
      loadAttributeDictionary(),
    ]);
    if (!type) return null;
    const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
    return {
      typeId: selectedTypeId ?? 0,
      requiredSkills: extractRequiredSkills(type.dogma_attributes),
      skillNames: names.types ?? {},
    };
  }, [selectedTypeId]);
  const itemSkills =
    useKeyedLoad(selectedTypeId === null ? null : String(selectedTypeId), loadItemSkills).data ??
    null;

  // Queue-corrected, like every other trained-level read (ItemDetailModal,
  // usePlanEditorData). A nice-to-have read, so a failure leaves no levels.
  const loadTrainedSkills = useCallback(
    () =>
      loadCorrectedSkills(activeCharacterId ?? 0, Date.now(), {
        skipQueueWithoutScope: true,
      }).then((corrected) => corrected.trained),
    [activeCharacterId]
  );
  const trainedSkills =
    useKeyedLoad(activeCharacterId === null ? null : String(activeCharacterId), loadTrainedSkills)
      .data ?? NO_TRAINED_SKILLS;

  const targetPlan = useTargetPlan(activeCharacterId);

  return { itemSkills, trainedSkills, targetPlan };
}
