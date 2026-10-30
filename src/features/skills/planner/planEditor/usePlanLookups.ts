import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillPlanRecord } from '@/db';
import { romanLevel } from '@/engine/projection';
import { findRemovalBlockers, planEntryKey } from '@/engine/skills/plan';
import type { AttributeName, PlanStep, TrainedSkill } from '@/engine/types';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import type { SkillCatalog } from '../../skillMap';
import type { SkillPlanEditable } from '../skillPlanEdit';

/**
 * The name lookups and plan-derived views the editor's rows, pickers and handlers share:
 * every skill name, label and "can this entry be removed" answer comes from here so the
 * identities handed to the memoized entry rows stay stable.
 */
export function usePlanLookups({
  plan,
  catalog,
  trainedSkills,
}: {
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
}) {
  const { t } = useTranslation();
  // useCallback'd (#408): both cross into EntryList as per-row props
  // (`nameFor`/`attributesFor`), which now wraps its rows in `React.memo` —
  // an identity that changed every render would defeat that regardless of
  // the row components' own memoization. `attributesFor` also returns the
  // catalog's own EngineSkill object rather than a fresh `{primary,
  // secondary}` literal: same reasoning one level deeper, since a *new*
  // object every call would still break memo even with a stable function.
  const nameFor = useCallback(
    (skillTypeID: number): string =>
      catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`,
    [catalog]
  );

  const attributesFor = useCallback(
    (skillTypeID: number): { primary: AttributeName; secondary: AttributeName } | undefined =>
      catalog.engineSkills.get(skillTypeID),
    [catalog]
  );

  const stepLabel = (step: PlanStep): string =>
    `${nameFor(step.skillTypeID)} ${romanLevel(step.level)}`;

  const pickerSkills = useMemo(
    () => [...catalog.bySkillTypeID.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog]
  );

  // What every Skill Plan edit (skillPlanEdit.ts) reads: the three aligned
  // lists alone, so a handler built on it keeps its identity across edits
  // to the plan's other fields (name, boosters, milestones).
  const editable = useMemo<SkillPlanEditable>(
    () => ({
      entries: plan.entries,
      markers: plan.markers,
      markerAttributes: plan.markerAttributes,
    }),
    [plan.entries, plan.markers, plan.markerAttributes]
  );

  /**
   * Which entries the remove button must refuse (#2223): removing one that
   * some other entry still needs would just have it reappear as a dimmed
   * prereq row, which used to look like the removal silently did nothing.
   */
  const removalBlockers = useMemo(
    () => findRemovalBlockers(editable.entries, catalog.engineSkills, trainedSkills),
    [editable.entries, catalog.engineSkills, trainedSkills]
  );

  const removalBlockedReason = useCallback(
    (skillTypeID: number, targetLevel: number): string | undefined => {
      const blocker = removalBlockers.get(planEntryKey(skillTypeID, targetLevel));
      if (!blocker) return undefined;
      return t('plans.removeBlockedByDependent', {
        blocker: `${nameFor(blocker.skillTypeID)} ${romanLevel(blocker.targetLevel)}`,
      });
    },
    [removalBlockers, nameFor, t]
  );

  /** A row's skill name is a link to the shared Skill Detail modal; as it is clicked this plan's own (possibly unsaved) entries are staged for it, so a prereq already staged here reads "Planned". */
  const stageSkillPlanEntries = useSkillDetailModalStore((state) => state.stage);
  const handleStageSkillDetail = useCallback(
    (skillTypeID: number) => stageSkillPlanEntries(skillTypeID, editable.entries),
    [editable.entries, stageSkillPlanEntries]
  );

  const userSkillTypeIDs = useMemo(
    () => new Set(plan.entries.map((e) => e.skillTypeID)),
    [plan.entries]
  );

  /** "{Skill} III" — how a promoted prereq is named back to the user. */
  const levelLabel = useCallback(
    (skillTypeID: number, level: number): string => `${nameFor(skillTypeID)} ${romanLevel(level)}`,
    [nameFor]
  );

  return {
    nameFor,
    attributesFor,
    stepLabel,
    pickerSkills,
    editable,
    removalBlockedReason,
    handleStageSkillDetail,
    userSkillTypeIDs,
    levelLabel,
  };
}
