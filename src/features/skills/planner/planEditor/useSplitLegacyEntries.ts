import { useEffect } from 'react';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { splitByLevel, type SkillPlanEditable } from '../skillPlanEdit';
import type { PlanEditorProps } from './types';

export function useSplitLegacyEntries({
  editable,
  engineSkills,
  trainedSkills,
  trainedSkillsKnown,
  onUpdate,
}: {
  editable: SkillPlanEditable;
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  trainedSkillsKnown: boolean;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  useEffect(() => {
    if (!trainedSkillsKnown) return;
    const patch = splitByLevel(editable, engineSkills, trainedSkills);
    if (patch) onUpdate(patch);
  }, [editable, engineSkills, trainedSkills, trainedSkillsKnown, onUpdate]);
}
