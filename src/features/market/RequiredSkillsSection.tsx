/**
 * "What skill affects this?" — each required skill, status + Add to Plan.
 * No Character: name + level only, not an always-"missing"/no-op Add.
 *
 * Shared by `ItemDetailModal` (the item-level view) and `Market.tsx`'s order
 * row expand (the same section, so a pilot who never opens Show Info still
 * sees it from the order book directly).
 */
import { useTranslation } from 'react-i18next';
import type { TrainedSkill } from '@/engine/types';
import type { RequiredSkill } from '@/features/skills/dogma';
import { SkillRow } from '@/features/skills/SkillRow';
import { skillTrainingStatus } from '@/features/skills/skillStatus';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { skillNameOrFallback } from './skillNameOrFallback';

export function RequiredSkillsSection({
  requiredSkills,
  skillNames,
  trainedSkills,
  target,
  hasCharacter,
  itemName,
}: {
  requiredSkills: readonly RequiredSkill[];
  skillNames: Readonly<Record<number, string>>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  target: TargetPlan;
  hasCharacter: boolean;
  itemName: string;
}) {
  const { t } = useTranslation();
  if (requiredSkills.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-line pb-1">
        <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('skills.requiredSkills.title')}
        </h3>
        {hasCharacter && <TargetPlanPicker target={target} />}
      </div>
      <div className="mt-1 space-y-1">
        {requiredSkills.map((req) => {
          const name = skillNameOrFallback(req.skillTypeID, skillNames);
          if (!hasCharacter) {
            return <NameOnlySkillRow key={req.skillTypeID} name={name} level={req.level} />;
          }
          const currentLevel = trainedSkills.get(req.skillTypeID)?.level ?? 0;
          return (
            <SkillRow
              key={req.skillTypeID}
              name={name}
              status={skillTrainingStatus(currentLevel, req.level)}
              currentLevel={currentLevel}
              addLabel={t('skills.requiredSkills.addToPlan')}
              onAdd={() =>
                void target.addEntries(
                  [{ skillTypeID: req.skillTypeID, targetLevel: req.level }],
                  itemName
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function NameOnlySkillRow({ name, level }: { name: string; level: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex-1 text-text">{name}</span>
      <span className="text-text-dim">{t('plans.level', { level })}</span>
    </div>
  );
}
