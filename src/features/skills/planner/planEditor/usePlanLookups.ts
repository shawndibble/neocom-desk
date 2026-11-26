import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillPlanRecord } from '@/db';
import { romanLevel } from '@/engine/projection';
import { findRemovalBlockers, planEntryKey } from '@/engine/skills/plan';
import type { AttributeName, PlanStep, TrainedSkill } from '@/engine/types';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import type { SkillCatalog } from '../../skillMap';
import type { SkillPlanEditable } from '../skillPlanEdit';

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

  const editable = useMemo<SkillPlanEditable>(
    () => ({
      entries: plan.entries,
      markers: plan.markers,
      markerAttributes: plan.markerAttributes,
    }),
    [plan.entries, plan.markers, plan.markerAttributes]
  );

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

  const stageSkillPlanEntries = useSkillDetailModalStore((state) => state.stage);
  const handleStageSkillDetail = useCallback(
    (skillTypeID: number) => stageSkillPlanEntries(skillTypeID, editable.entries),
    [editable.entries, stageSkillPlanEntries]
  );

  const userSkillTypeIDs = useMemo(
    () => new Set(plan.entries.map((e) => e.skillTypeID)),
    [plan.entries]
  );

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
