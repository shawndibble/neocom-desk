import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import { romanLevel } from '@/engine/projection';
import type { TrainedSkill } from '@/engine/types';
import type { RequiredSkill } from '@/features/skills/dogma';
import { isEntryCovered, plannedLevelFor } from '@/features/skills/planner/reorder';
import { SkillLink } from '@/features/entities';
import { SkillRow } from '@/features/skills/SkillRow';
import { skillTrainingStatus } from '@/features/skills/skillStatus';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { targetPlanEntries, type TargetPlan } from '@/features/skills/useTargetPlan';
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

  const addLabel =
    target.plans?.length === 0
      ? t('skills.fitCheck.createPlanAndAdd')
      : t('skills.requiredSkills.addToPlan');

  const planEntries = targetPlanEntries(target);
  const anyUntrained = requiredSkills.some(
    (req) => (trainedSkills.get(req.skillTypeID)?.level ?? 0) < req.level
  );

  return (
    <div>
      <div className="flex items-center justify-between border-b border-line pb-1">
        <h3 className={eyebrowClassName}>{t('skills.requiredSkills.title')}</h3>
        {hasCharacter && anyUntrained && <TargetPlanPicker target={target} />}
      </div>
      <div className="mt-1 space-y-1">
        {requiredSkills.map((req) => {
          const name = skillNameOrFallback(req.skillTypeID, skillNames);
          if (!hasCharacter) {
            return (
              <NameOnlySkillRow
                key={req.skillTypeID}
                name={name}
                level={req.level}
                skillTypeID={req.skillTypeID}
              />
            );
          }
          const currentLevel = trainedSkills.get(req.skillTypeID)?.level ?? 0;
          const planned = isEntryCovered(planEntries, req.skillTypeID, req.level);
          return (
            <SkillRow
              key={req.skillTypeID}
              name={`${name} ${romanLevel(req.level)}`}
              skillTypeID={req.skillTypeID}
              planEntries={planEntries}
              status={skillTrainingStatus(currentLevel, req.level)}
              currentLevel={currentLevel}
              requiredLevel={req.level}
              plannedLevel={plannedLevelFor(planEntries, req.skillTypeID)}
              addLabel={planned ? t('skills.requiredSkills.added') : addLabel}
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

function NameOnlySkillRow({
  name,
  level,
  skillTypeID,
}: {
  name: string;
  level: number;
  skillTypeID: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs">
      <SkillLink typeId={skillTypeID} className="flex-1">
        {name}
      </SkillLink>
      <span className="text-text-dim">{t('plans.level', { level })}</span>
    </div>
  );
}
