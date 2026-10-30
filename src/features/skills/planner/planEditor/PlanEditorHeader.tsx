import { useTranslation } from 'react-i18next';
import type { SkillPlanRecord } from '@/db';
import { PlanHeader } from '../PlanHeader';
import { remapSavingsShrank } from '../planHeaderStats';
import type { useMilestones } from '../useMilestones';
import { whatIfVerdict } from '../whatIfImplants';
import type { PlanEditorProps } from './types';
import type { usePlanAssumptions } from './usePlanAssumptions';
import type { usePlanHeaderStats } from './usePlanHeaderStats';
import type { PlanScheduleResult } from './usePlanSchedule';

/** The plan header: totals, remap-savings chip, next milestone and the What-If lens comparison. */
export function PlanEditorHeader({
  plan,
  schedule,
  currentLensTotalSeconds,
  whatIf,
  headerStats,
  nextMilestone,
  trainedKnown,
  isDesktop,
  focusName,
  onUpdate,
}: {
  plan: SkillPlanRecord;
  schedule: PlanScheduleResult;
  currentLensTotalSeconds: number | null;
  whatIf: ReturnType<typeof usePlanAssumptions>['whatIf'];
  headerStats: ReturnType<typeof usePlanHeaderStats>;
  nextMilestone: ReturnType<typeof useMilestones>['headerNextMilestone'];
  trainedKnown: boolean;
  isDesktop: boolean;
  focusName: boolean;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  const { t } = useTranslation();
  const { totalSeconds, skillCount, finish: planFinish, error } = schedule;
  const { headerBadge, headerProgress, realLensSavingsSeconds } = headerStats;
  return (
    <PlanHeader
      totalSeconds={totalSeconds}
      skillCount={skillCount}
      projectedFinish={planFinish}
      badge={headerBadge}
      nextMilestone={nextMilestone}
      progress={headerProgress}
      whatIf={
        currentLensTotalSeconds !== null && !error
          ? {
              lens:
                whatIf.kind === 'custom'
                  ? t('plans.whatIfCustom')
                  : whatIf.preset === 'none'
                    ? t('plans.whatIfNone')
                    : whatIf.preset,
              verdict: whatIfVerdict(currentLensTotalSeconds, totalSeconds),
            }
          : null
      }
      savingsShrankWithImplants={remapSavingsShrank(
        headerBadge?.savingsSeconds ?? null,
        realLensSavingsSeconds
      )}
      trainedKnown={trainedKnown}
      name={plan.name}
      onRename={isDesktop ? undefined : (name) => onUpdate({ name })}
      focusName={focusName}
    />
  );
}
