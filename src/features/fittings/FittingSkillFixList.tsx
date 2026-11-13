/**
 * Training that makes a Fitting fit — over-budget fixes (`findSkillFixes`), or
 * the skills it is missing: each fix's skill levels, the time they take
 * (prerequisites included) and Add to plan — or the plan that already trains
 * them. Shared by What to train, where it heads the list, and Make it fit.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { SkillFix } from '@/engine/fittings/skillFixes';
import { scheduledSkillTargets } from '@/engine/fittings/skillGains';
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { SkillLink } from '@/features/entities';
import { formatCountdown } from '@/lib/duration';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { WhatToTrainPrerequisites } from './FittingWhatToTrainPrerequisites';
import { STAT_DETAIL, statRowClassName } from './statKit';
import type { ScheduleEntries } from './useModuleUpgrades';

interface Props {
  fixes: readonly Pick<SkillFix, 'entries'>[];
  /** The skill catalogue; undefined while it loads. */
  skills: ReadonlyMap<number, EngineSkill> | undefined;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /** Null before the Character's skills are in. */
  scheduleEntriesFor: ScheduleEntries | null;
  /** The target Skill Plan; null when the Character has none yet, undefined while plans load. */
  plan: SkillPlanRecord | null | undefined;
  /** The highest level the plan trains each skill to, prerequisite rows included. */
  plannedLevels: ReadonlyMap<number, number>;
  onAdd: (entries: readonly PlanEntry[]) => void;
  /** Why each row fixes the fit; default: it brings the Fitting under budget. */
  reason?: string;
}

/** Quickest to train first; a fix not yet timed last. */
export function SkillFixList({
  fixes,
  skills,
  trainedSkills,
  scheduleEntriesFor,
  plan,
  plannedLevels,
  onAdd,
  reason,
}: Props) {
  const { t } = useTranslation();
  const skillName = (id: number) => skills?.get(id)?.name ?? `#${id}`;
  const rows = fixes
    .map((fix) => {
      const scheduled = scheduleEntriesFor?.(fix.entries) ?? null;
      const seconds = scheduled?.reduce((sum, step) => sum + step.seconds, 0) ?? null;
      // A step for a skill the fix doesn't name is a prerequisite.
      const includesPrerequisites =
        scheduled?.some((step) => !fix.entries.some((e) => e.skillTypeID === step.skillTypeID)) ??
        false;
      const prerequisiteRows =
        includesPrerequisites && scheduled && skills
          ? buildFitCheckRows(scheduledSkillTargets(scheduled), skills, trainedSkills, scheduled)
          : [];
      return { fix, seconds, includesPrerequisites, prerequisiteRows };
    })
    .sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity));

  return (
    <ul className="m-0 list-none p-0 text-xs">
      {rows.map(({ fix, seconds, includesPrerequisites, prerequisiteRows }) => {
        const label = fix.entries
          .map((e) => `${skillName(e.skillTypeID)} ${romanLevel(e.targetLevel)}`)
          .join(', ');
        const planned = fix.entries.every(
          (e) => (plannedLevels.get(e.skillTypeID) ?? 0) >= e.targetLevel
        );
        return (
          <li key={label} className={statRowClassName()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {fix.entries.map((e, i) => (
                    <span key={e.skillTypeID}>
                      {i > 0 && ', '}
                      <SkillLink typeId={e.skillTypeID} planEntries={plan?.entries}>
                        {skillName(e.skillTypeID)}
                      </SkillLink>{' '}
                      {romanLevel(e.targetLevel)}
                    </span>
                  ))}
                </p>
                <p className={STAT_DETAIL}>{reason ?? t('fittings.skillFixes.makesItFit')}</p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                {seconds === null ? (
                  <span className="text-text-dim">{t('common.loading')}</span>
                ) : (
                  formatCountdown(seconds)
                )}
                {seconds !== null && includesPrerequisites && (
                  <div>
                    <WhatToTrainPrerequisites
                      skill={label}
                      rows={prerequisiteRows}
                      plannedLevels={plannedLevels}
                      planEntries={plan?.entries}
                      totalSeconds={seconds}
                    />
                  </div>
                )}
              </div>
            </div>
            {plan !== undefined && (
              <div className="mt-1 flex justify-end">
                {plan && planned ? (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('fittings.skillFixes.inPlan', { plan: plan.name })}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    aria-label={t('fittings.whatToTrain.addToPlanLabel', { skill: label })}
                    onClick={() => onAdd(fix.entries)}
                  >
                    {t('fittings.whatToTrain.addToPlan')}
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
