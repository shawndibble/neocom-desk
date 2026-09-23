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

  const addLabel =
    target.plans?.length === 0
      ? t('skills.fitCheck.createPlanAndAdd')
      : t('skills.requiredSkills.addToPlan');

  // The target plan itself, live off Dexie — reflects both entries the plan
  // already had (e.g. added from a different item earlier) and ones just
  // added this session, once the write resolves. `SkillRow`'s own status
  // only ever reflects *trained* level, never *planned*, so without this a
  // skill already in the plan looks identical to one that isn't — a click on
  // "Add" then does nothing visible, which reads as broken (issue report:
  // "clicked Add to Skill Plan and nothing happened" — the skill was already
  // there from before).
  const selectedPlan = target.plans?.find((p) => p.id === target.targetPlanId);

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
          // Mirrors `upsertEntry`'s own "already covered" check, since that's
          // exactly the condition under which clicking Add would no-op.
          const planned = (selectedPlan?.entries ?? []).some(
            (e) => e.skillTypeID === req.skillTypeID && e.targetLevel >= req.level
          );
          return (
            <SkillRow
              key={req.skillTypeID}
              name={name}
              status={skillTrainingStatus(currentLevel, req.level)}
              currentLevel={currentLevel}
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

function NameOnlySkillRow({ name, level }: { name: string; level: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex-1 text-text">{name}</span>
      <span className="text-text-dim">{t('plans.level', { level })}</span>
    </div>
  );
}
