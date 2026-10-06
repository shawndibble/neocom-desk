import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddToPlanBar, type AddedToPlan } from './AddToPlanBar';
import { isEntryCovered } from './planner/reorder';
import { targetPlanEntries, useTargetPlan } from './useTargetPlan';

interface SkillPlanAddProps {
  characterId: number;
  skillTypeID: number;
  skillName: string;
  /** The character's trained level (0-5); the add targets the next one. */
  currentLevel: number;
}

/**
 * The selected skill's "Add to Skill Plan" (the Skills list rows have no menu
 * of their own): the next level into the target plan, with the plan picker
 * and Undo `AddToPlanBar` carries.
 */
export function SkillPlanAdd({
  characterId,
  skillTypeID,
  skillName,
  currentLevel,
}: SkillPlanAddProps) {
  const { t } = useTranslation();
  const target = useTargetPlan(characterId);
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  if (currentLevel >= 5) {
    return <p className="text-xs text-text-dim">{t('skills.inspector.maxLevel')}</p>;
  }
  const targetLevel = currentLevel + 1;
  const covered = isEntryCovered(targetPlanEntries(target), skillTypeID, targetLevel);

  async function add() {
    const entry = { skillTypeID, targetLevel };
    const result = await target.addEntries([entry], skillName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <div className="space-y-1">
      <AddToPlanBar
        target={target}
        unplannedCount={covered ? 0 : 1}
        addLabel={t('skills.inspector.addToPlan')}
        added={added}
        onAdd={() => void add()}
        onUndo={() => {
          if (!added) return;
          void target.removeEntries(added.planId, added.entries);
          setAdded(null);
        }}
      />
      {covered && !added && (
        <p className="text-right text-xs text-success">{t('skills.fitCheck.inPlan')}</p>
      )}
    </div>
  );
}
