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
  /** The character's trained level (0-5). */
  currentLevel: number;
  /** For the levels the target plan trains as prerequisites of other entries. */
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
}

/**
 * A skill's "Add to Skill Plan" (the Skills inspector, the skill Show info):
 * the first level neither trained nor already in the target plan, with the
 * plan picker and Undo `AddToPlanBar` carries.
 */
export function SkillPlanAdd({
  characterId,
  skillTypeID,
  skillName,
  currentLevel,
  engineSkills,
  trainedSkills,
}: SkillPlanAddProps) {
  const { t } = useTranslation();
  const target = useTargetPlan(characterId);
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const entries = targetPlanEntries(target);
  const plannedLevel = useMemo(
    () => plannedLevels(entries, engineSkills, trainedSkills).get(skillTypeID) ?? 0,
    [entries, engineSkills, trainedSkills, skillTypeID]
  );
  if (currentLevel >= 5) {
    return <p className="text-xs text-text-dim">{t('skills.inspector.maxLevel')}</p>;
  }
  const targetLevel = Math.max(currentLevel, plannedLevel) + 1;
  const covered = targetLevel > 5;

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
        addLabel={t('skills.inspector.addLevelToPlan', { level: targetLevel })}
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
