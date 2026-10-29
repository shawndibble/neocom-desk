import { useMemo, useState } from 'react';
import type { TrainedSkill } from '@/engine/types';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { addRemapMarker, removeTrainedEntries, type SkillPlanEditable } from '../skillPlanEdit';
import { useScopedState } from '../useScopedState';
import type { PlanEditorProps, TrainedRemoved } from './types';

/** The tools pane's own edits: "Remove trained skills" (with Undo) and "Add marker", with their confirmations. */
export function usePlanToolActions({
  planId,
  editable,
  trainedSkills,
  onUpdate,
}: {
  planId: string;
  editable: SkillPlanEditable;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  // Inline, beside-the-button confirmations (#222) — same pattern as
  // copyConfirm/importConfirm above: small text next to the triggering
  // button, cleared after a couple of seconds. Additive to the full
  // Panel/Modal results those same actions already produce below.
  // "Remove trained skills": the count it removed and the plan as it stood, for the Undo beside it. Scoped to the plan like undoImport.
  const [trainedRemoved, setTrainedRemoved] = useScopedState<TrainedRemoved>([planId]);
  const { show: showTrainedRemoved, cancel: cancelTrainedRemoved } =
    useAutoDismiss<TrainedRemoved | null>(setTrainedRemoved, null);
  const [markerConfirm, setMarkerConfirm] = useState(false);
  const { show: showMarkerConfirm } = useAutoDismiss<boolean>(setMarkerConfirm, false);

  // Whether the plan holds any row the character already trained: the button is absent when there is nothing to remove.
  const hasTrainedEntries = useMemo(
    () => removeTrainedEntries(editable, trainedSkills) !== null,
    [editable, trainedSkills]
  );

  function handleRemoveTrained() {
    const removal = removeTrainedEntries(editable, trainedSkills);
    if (!removal) return;
    onUpdate(removal.patch);
    // Long enough to use the Undo it carries, like Replace's.
    showTrainedRemoved({ count: removal.removed, undo: removal.undo }, 10000);
  }

  function undoRemoveTrained() {
    if (!trainedRemoved) return;
    cancelTrainedRemoved();
    onUpdate(trainedRemoved.undo);
    setTrainedRemoved(null);
  }

  function handleAddMarker() {
    onUpdate(addRemapMarker(editable));
    showMarkerConfirm(true);
  }

  return {
    hasTrainedEntries,
    trainedRemoved,
    markerConfirm,
    handleRemoveTrained,
    undoRemoveTrained,
    handleAddMarker,
  };
}
