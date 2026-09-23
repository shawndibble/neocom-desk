/**
 * Required-skills-to-use for the order row expand (`OrderDetailPanel`) — the
 * same section and the same fetch `ItemDetailModal` already does for "Show
 * Info", read once per selected item here instead of once per opened row:
 * every order in the book is the same item, so the answer is identical for
 * all of them. Bundled with the character's trained skills and the target
 * plan, since all three feed that one panel together.
 */
import { useEffect, useState } from 'react';
import { getUniverseType } from '@/esi/endpoints';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadAttributeReferenceNames } from '@/features/market/attributeReferenceNames';
import { extractRequiredSkills, type RequiredSkill } from '@/features/skills/dogma';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { useTargetPlan, type TargetPlan } from '@/features/skills/useTargetPlan';
import type { TrainedSkill } from '@/engine/types';

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

export function useOrderRowSkills(
  selectedTypeId: number | null,
  activeCharacterId: number | null
): OrderRowSkills {
  const [itemSkills, setItemSkills] = useState<ItemSkills | null>(null);
  useEffect(() => {
    if (selectedTypeId === null) return;
    let cancelled = false;
    void (async () => {
      // Never rejects: same as `ItemDetailModal`'s own `pi.catch(() => null)`
      // — a nice-to-have fetch for a row-expand section that already renders
      // nothing while `itemSkills` is null, so a failure just leaves it out
      // rather than needing an error state of its own.
      try {
        const [{ data: type }, dictionary] = await Promise.all([
          getUniverseType(selectedTypeId),
          loadAttributeDictionary(),
        ]);
        if (cancelled || !type) return;
        const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
        if (cancelled) return;
        setItemSkills({
          typeId: selectedTypeId,
          requiredSkills: extractRequiredSkills(type.dogma_attributes),
          skillNames: names.types ?? {},
        });
      } catch {
        // Left null — see comment above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId]);

  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (activeCharacterId === null) {
        if (!cancelled) setTrainedSkills(new Map());
        return;
      }
      // Queue-corrected, like every other trained-level read (ItemDetailModal,
      // usePlanEditorData) — a level the queue just finished but /skills
      // hasn't caught up to would otherwise show wrong here while everywhere
      // else shows it trained.
      try {
        const corrected = await loadCorrectedSkills(activeCharacterId, Date.now(), {
          skipQueueWithoutScope: true,
        });
        if (!cancelled) setTrainedSkills(corrected.trained);
      } catch {
        // Left at whatever it was — a nice-to-have read for the row-expand
        // skills section, not something worth an error state of its own.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  const targetPlan = useTargetPlan(activeCharacterId);

  return { itemSkills, trainedSkills, targetPlan };
}
