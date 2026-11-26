import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, PlanPriority, TrainedSkill } from '@/engine/types';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { neighbourFocusCandidates, planRowHandle } from '../focusNeighbour';
import type { MergedRow } from '../queueRows';
import {
  moveRow,
  promotePrereqRow,
  removeEntry,
  removeRemapMarker,
  setPriority,
  type SkillPlanEditable,
} from '../skillPlanEdit';
import { useScopedState } from '../useScopedState';
import type { PlanEditorProps } from './types';

export function usePlanRowActions({
  planId,
  planScope,
  editable,
  mergedRows,
  engineSkills,
  trainedSkills,
  nameFor,
  levelLabel,
  onUpdate,
}: {
  planId: string;
  planScope: readonly unknown[];
  editable: SkillPlanEditable;
  mergedRows: readonly MergedRow[];
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  nameFor: (skillTypeID: number) => string;
  levelLabel: (skillTypeID: number, level: number) => string;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  const { t } = useTranslation();
  const [promoteConfirm, setPromoteConfirm] = useState<string | null>(null);
  const { show: showPromoteConfirm } = useAutoDismiss<string | null>(setPromoteConfirm, null);
  const [removedToast, setRemovedToast] = useScopedState<{
    message: string;
    onUndo: () => void;
  }>([planId]);
  const entriesHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const mergedRowsRef = useRef<readonly MergedRow[]>([]);
  const editableRef = useRef<SkillPlanEditable>({ entries: [] });
  const [dropError, setDropError] = useScopedState<string>(planScope);

  useEffect(() => {
    mergedRowsRef.current = mergedRows;
    editableRef.current = editable;
  });

  const confirmPromotion = useCallback(
    (skillTypeID: number, level: number) => {
      showPromoteConfirm(t('plans.prereqPromoted', { name: levelLabel(skillTypeID, level) }), 4000);
    },
    [t, levelLabel, showPromoteConfirm]
  );

  const handleDrop = useCallback(
    (activeId: string, overId: string) => {
      const result = moveRow(editable, {
        rows: mergedRows,
        activeId,
        overId,
        skills: engineSkills,
        trainedSkills,
      });
      if (!result.ok) {
        setDropError(
          result.skillTypeID === result.blockedBy
            ? t('plans.dropBlockedSameSkill', {
                skill: nameFor(result.skillTypeID),
                level: romanLevel(result.targetLevel),
                blockerLevel: romanLevel(result.blockedByLevel),
              })
            : t('plans.dropBlocked', {
                skill: nameFor(result.skillTypeID),
                blocker: nameFor(result.blockedBy),
              })
        );
        return;
      }
      setDropError(null);
      onUpdate(result.patch);
      if (result.promoted) confirmPromotion(result.promoted.skillTypeID, result.promoted.level);
    },
    [
      editable,
      mergedRows,
      engineSkills,
      trainedSkills,
      t,
      nameFor,
      confirmPromotion,
      onUpdate,
      setDropError,
    ]
  );

  const handlePromotePrereq = useCallback(
    (rowId: string) => {
      const patch = promotePrereqRow(editable, mergedRows, rowId);
      if (!patch) return;
      setDropError(null);
      onUpdate(patch);
      const row = mergedRows.find((r) => r.id === rowId);
      if (row?.kind === 'prereq') {
        confirmPromotion(row.step.skillTypeID, row.step.level);
        focusAfterCommit(() => planRowHandle(`${row.step.skillTypeID}-${row.step.level}`));
      }
    },
    [editable, mergedRows, onUpdate, confirmPromotion, setDropError, focusAfterCommit]
  );

  const requestRemoveEntry = useCallback(
    (skillTypeID: number, targetLevel: number) => {
      const before = editableRef.current;
      const landing = neighbourFocusCandidates(
        mergedRowsRef.current,
        `${skillTypeID}-${targetLevel}`,
        entriesHeadingRef
      );
      const snapshot: Required<SkillPlanEditable> = {
        entries: before.entries,
        markers: before.markers ?? [],
        markerAttributes: before.markerAttributes ?? [],
      };
      const saved = onUpdate(removeEntry(before, skillTypeID, targetLevel));
      setRemovedToast({
        message: t('plans.entryRemoved', { name: levelLabel(skillTypeID, targetLevel) }),
        onUndo: () => {
          setRemovedToast(null);
          void onUpdate(snapshot);
        },
      });
      void Promise.resolve(saved).then(() => focusAfterCommit(...landing));
    },
    [onUpdate, focusAfterCommit, setRemovedToast, levelLabel, t]
  );

  const handleRemoveMarker = useCallback(
    (markerIndex: number) => {
      const marker = mergedRows.find((r) => r.kind === 'marker' && r.markerIndex === markerIndex);
      onUpdate(removeRemapMarker(editable, markerIndex));
      focusAfterCommit(
        ...neighbourFocusCandidates(mergedRows, marker?.id ?? '', entriesHeadingRef)
      );
    },
    [editable, mergedRows, onUpdate, focusAfterCommit]
  );

  const handleSetPriority = useCallback(
    (skillTypeID: number, priority: PlanPriority) =>
      onUpdate(setPriority(editable, skillTypeID, priority)),
    [editable, onUpdate]
  );

  return {
    dropError,
    promoteConfirm,
    removedToast,
    setRemovedToast,
    entriesHeadingRef,
    focusAfterCommit,
    handleDrop,
    handlePromotePrereq,
    requestRemoveEntry,
    handleRemoveMarker,
    handleSetPriority,
  };
}
