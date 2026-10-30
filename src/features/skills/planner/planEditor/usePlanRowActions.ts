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

/** The entry list's row edits: reorder drops, prereq promotion, remove with Undo, marker removal and priority. */
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
  // A promoted prereq row is a quieter change than it looks (a dimmed row
  // turns into user data), so it says so. A "that worked" note about the
  // change that just landed, so it clears on its own timer, not with the plan.
  const [promoteConfirm, setPromoteConfirm] = useState<string | null>(null);
  const { show: showPromoteConfirm } = useAutoDismiss<string | null>(setPromoteConfirm, null);
  // A removed entry goes at once, with an Undo toast rather than a confirm
  // dialog. Scoped to plan.id so a plan switch can't offer an undo for another plan.
  const [removedToast, setRemovedToast] = useScopedState<{
    message: string;
    onUndo: () => void;
  }>([planId]);
  // Focus after a remove goes to a neighbour row, else this heading (WCAG 2.4.3).
  const entriesHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  // A ref keeps `requestRemoveEntry` stable, so memoized rows don't re-render on every recompute.
  const mergedRowsRef = useRef<readonly MergedRow[]>([]);
  const editableRef = useRef<SkillPlanEditable>({ entries: [] });
  // Outcome of the last drag on the entry list. A drop that would land a
  // skill after something requiring it is refused rather than silently
  // re-normalized back (planDrop.ts), so the refusal has to say why. It
  // describes one drag against one entry order — once the order moves on it
  // describes nothing.
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

  /**
   * One drag on the merged list — or the equivalent non-drag move (#408's
   * row-actions menu resolves its own target id and calls this the same way
   * EntryList's DndContext does). planDrop decides what it meant — a plain
   * reorder, a prereq row promoted into a real entry, or a drop the
   * normalizer would silently undo, which is refused with the entry that
   * requires the dragged skill named rather than springing back unexplained.
   *
   * useCallback'd: crosses into EntryList's memoized rows as the row-actions
   * menu's `onReorder` prop (#408) — see nameFor's comment for why an
   * unstable identity there would defeat that memoization.
   */
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
        // A skill is never its own prerequisite: when both sides are the same
        // skill, what refused the drop is one of its own levels being trained
        // first, and the cross-skill wording ("X is a prerequisite of X")
        // reads as gibberish for the very gesture per-level rows exist for.
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

  /** The "+" on a prereq row: the same promotion, without needing a drag. */
  const handlePromotePrereq = useCallback(
    (rowId: string) => {
      const patch = promotePrereqRow(editable, mergedRows, rowId);
      if (!patch) return;
      setDropError(null);
      onUpdate(patch);
      const row = mergedRows.find((r) => r.id === rowId);
      if (row?.kind === 'prereq') {
        confirmPromotion(row.step.skillTypeID, row.step.level);
        // The prereq row becomes an entry row with this id, once the update lands.
        focusAfterCommit(() => planRowHandle(`${row.step.skillTypeID}-${row.step.level}`));
      }
    },
    [editable, mergedRows, onUpdate, confirmPromotion, setDropError, focusAfterCommit]
  );

  /** EntryList's `onRemove`: removes at once and offers Undo, which restores the plan as it was. */
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
      // The save is async, so the row can outlive the click: once it has
      // landed, move focus off the gone ⋮.
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
