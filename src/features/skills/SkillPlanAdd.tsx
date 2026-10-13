import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { AddToPlanBar, type AddedToPlan } from './AddToPlanBar';
import { plannedLevels } from './skillRequirements';
import { targetPlanEntries, useTargetPlan } from './useTargetPlan';

interface SkillPlanAddProps {
  characterId: number;
  skillTypeID: number;
  skillName: string;
  /** For the levels the target plan trains as prerequisites of other entries. */
  engineSkills: ReadonlyMap<number, EngineSkill>;
  /** Corrected trained levels; also gives this skill's own. */
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
}

/**
 * The skill Show info's "Add to Skill Plan": first level neither trained nor
 * already in the target plan, with `AddToPlanBar`'s plan picker and Undo.
 */
export function SkillPlanAdd({
  characterId,
  skillTypeID,
  skillName,
  engineSkills,
  trainedSkills,
}: SkillPlanAddProps) {
  const { t } = useTranslation();
  const target = useTargetPlan(characterId);
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const { plans, targetPlanId } = target;
  const currentLevel = trainedSkills.get(skillTypeID)?.level ?? 0;
  const maxed = currentLevel >= 5;
  const plannedLevel = useMemo(
    () =>
      maxed
        ? 0
        : (plannedLevels(
            targetPlanEntries({ plans, targetPlanId }),
            engineSkills,
            trainedSkills
          ).get(skillTypeID) ?? 0),
    [maxed, plans, targetPlanId, engineSkills, trainedSkills, skillTypeID]
  );
  if (maxed) {
    return <p className="text-xs text-text-dim">{t('skills.inspector.maxLevel')}</p>;
  }
  const targetLevel = Math.max(currentLevel, plannedLevel) + 1;
  const planMaxed = targetLevel > 5;

  async function add() {
    const entry = { skillTypeID, targetLevel };
    const result = await target.addEntries([entry], skillName);
    if (result.added.length === 0) return;
    // Adds chain (level III, then IV): Undo takes back every one into this plan, not just the last.
    setAdded((prev) => ({
      planId: result.planId,
      planName: result.planName,
      entries: prev?.planId === result.planId ? [...prev.entries, ...result.added] : result.added,
    }));
  }

  return (
    <div className="space-y-1">
      <AddToPlanBar
        target={target}
        unplannedCount={planMaxed ? 0 : 1}
        addLabel={t('skills.inspector.addLevelToPlan', { level: targetLevel })}
        added={added}
        onAdd={() => void add()}
        onUndo={() => {
          if (!added) return;
          void target.removeEntries(added.planId, added.entries);
          setAdded(null);
        }}
      />
      {planMaxed && !added && (
        <p className="text-right text-xs text-success">{t('skills.fitCheck.inPlan')}</p>
      )}
    </div>
  );
}
