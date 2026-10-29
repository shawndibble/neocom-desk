import { useEffect } from 'react';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { splitByLevel, type SkillPlanEditable } from '../skillPlanEdit';
import type { PlanEditorProps } from './types';

/** Splits a legacy multi-level entry into one row per level the first time such a plan is opened. */
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
  // One row per skill level (reorder.ts). Plans written before that rule —
  // and any entry added at a level several above the character's trained one
  // — hold a single entry spanning "IV–V", which cannot be dragged apart.
  // Split it, once, the first time such a plan is opened, moving its Remap
  // Markers to keep them in front of the same entries. Idempotent, so a plan
  // already split writes nothing and this never loops.
  //
  // Gated on `trainedSkillsKnown`, never on the catalog: the catalog ships in
  // the bundle and loads even when ESI has told us nothing, and splitting a
  // plan against "no levels trained" cuts rows for levels the character
  // already has. Those extra rows train nothing, so a later split cannot
  // remove them — it would rewrite a correct plan into a permanently wrong
  // one, on a fresh device or an expired token, without the user touching
  // anything.
  useEffect(() => {
    if (!trainedSkillsKnown) return;
    const patch = splitByLevel(editable, engineSkills, trainedSkills);
    if (patch) onUpdate(patch);
  }, [editable, engineSkills, trainedSkills, trainedSkillsKnown, onUpdate]);
}
