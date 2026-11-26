import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import type { TrainedSkill } from '@/engine/types';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { RequiredSkillsSection } from './RequiredSkillsSection';
import type { ItemSkills } from './useOrderRowSkills';

export function ItemSkillsDisclosure({
  typeId,
  itemSkills,
  trainedSkills,
  targetPlan,
  hasCharacter,
  itemName,
}: {
  typeId: number;
  itemSkills: ItemSkills | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  targetPlan: TargetPlan;
  hasCharacter: boolean;
  itemName: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (itemSkills === null || itemSkills.typeId !== typeId) return null;
  const { requiredSkills } = itemSkills;
  if (requiredSkills.length === 0) return null;

  const trained = requiredSkills.filter(
    (skill) => (trainedSkills.get(skill.skillTypeID)?.level ?? 0) >= skill.level
  ).length;

  return (
    <Disclosure
      label={t('skills.requiredSkills.title')}
      trailing={
        hasCharacter
          ? t('market.itemSkills.trained', { trained, count: requiredSkills.length })
          : t('market.itemSkills.count', { count: requiredSkills.length })
      }
      expanded={expanded}
      onToggle={() => setExpanded((was) => !was)}
      className="border border-line"
    >
      <div className="p-2">
        <RequiredSkillsSection
          requiredSkills={requiredSkills}
          skillNames={itemSkills.skillNames}
          trainedSkills={trainedSkills}
          target={targetPlan}
          hasCharacter={hasCharacter}
          itemName={itemName}
        />
      </div>
    </Disclosure>
  );
}
