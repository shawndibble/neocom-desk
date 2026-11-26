import { useMemo, useState } from 'react';
import type { TrainedSkill } from '@/engine/types';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { addRemapMarker, removeTrainedEntries, type SkillPlanEditable } from '../skillPlanEdit';
import { useScopedState } from '../useScopedState';
import type { PlanEditorProps, TrainedRemoved } from './types';

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
  const [trainedRemoved, setTrainedRemoved] = useScopedState<TrainedRemoved>([planId]);
  const { show: showTrainedRemoved, cancel: cancelTrainedRemoved } =
    useAutoDismiss<TrainedRemoved | null>(setTrainedRemoved, null);
  const [markerConfirm, setMarkerConfirm] = useState(false);
  const { show: showMarkerConfirm } = useAutoDismiss<boolean>(setMarkerConfirm, false);

  const hasTrainedEntries = useMemo(
    () => removeTrainedEntries(editable, trainedSkills) !== null,
    [editable, trainedSkills]
  );

  function handleRemoveTrained() {
    const removal = removeTrainedEntries(editable, trainedSkills);
    if (!removal) return;
    onUpdate(removal.patch);
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
