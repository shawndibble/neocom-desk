import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, StatChip, TextInput, type StatChipTone } from '@/components/ui';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { formatCompactNumber } from '@/lib/compactNumber';
import type { PlanProgress } from '@/engine/planProgress';
import { MIN_MEANINGFUL_SAVINGS_SECONDS, type OptimizationBadge } from './planHeaderStats';
import type { WhatIfVerdict } from './whatIfImplants';

const WHAT_IF_TONE: Record<WhatIfVerdict['kind'], StatChipTone> = {
  saves: 'success',
  costs: 'warning',
  same: 'default',
};

interface PlanHeaderProps {
  totalSeconds: number;
  skillCount: number;
  projectedFinish: Date | null;
  /** null when the plan has no valid entries to optimize. */
  badge: OptimizationBadge | null;
  /**
   * The soonest not-yet-reached Plan Milestone (CONTEXT.md), or null when the
   * plan has none still ahead — a reached or orphaned one never shows here
   * (`engine/skillPlanMilestones.ts`'s `nextMilestone`).
   */
  nextMilestone: { name: string; finish: Date } | null;
  /** Share of the plan already trained; omitted by callers with no plan basis. */
  progress?: PlanProgress;
  /**
   * The What-If Implants lens against the clone's real implants; omitted or
   * null while the plan is costed on the real implants.
   */
  whatIf?: { lens: string; verdict: WhatIfVerdict } | null;
  /** False until the character's trained skills have loaded: progress reads `—`, not 0%. */
  trainedKnown?: boolean;
  /**
   * The open plan's name; when given it replaces the generic panel title. Editable
   * only when `onRename` is too — beside the plan list (wide screens) renaming lives
   * in that list's row menu, so the header shows plain text there.
   */
  name?: string;
  onRename?: (name: string) => void;
  /** Focus (and select) the name field on mount, for a plan just created. */
  focusName?: boolean;
}

/**
 * Plan-at-a-glance header: total time, skill count, projected finish, a live
 * remap-savings badge, the next Plan Milestone still ahead, and the what-if
 * lens's gain or loss.
 */
export function PlanHeader({
  totalSeconds,
  skillCount,
  projectedFinish,
  badge,
  nextMilestone,
  progress,
  whatIf = null,
  trainedKnown = true,
  name,
  onRename,
  focusName = false,
}: PlanHeaderProps) {
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  // null while not editing, so the field shows `name` itself and follows a
  // rename made elsewhere (the list) or a switch to another plan.
  const [draftName, setDraftName] = useState<string | null>(null);
  useEffect(() => {
    if (!focusName) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [focusName]);

  function commitName() {
    const next = draftName?.trim();
    setDraftName(null);
    if (next && next !== name) onRename?.(next);
  }
  const savingsSeconds = badge?.savingsSeconds ?? 0;
  const progressFraction = progress?.fraction ?? null;
  const showsSavings = badge !== null && savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;

  return (
    // Still pinned, but now the *only* pinned thing on the page, so its
    // offset is a plain `top-0` rather than a number measured off a
    // neighbour. The entry list has its own cap, yet the window can still
    // scroll when the sidebar beside it outgrows the viewport (a long plan
    // list plus an expanded optimize result) — and this strip is the plan's
    // headline numbers, which should survive that. What retires #221/#229 is
    // that there is no second sticky panel below needing this one's rendered
    // height; nothing here has to stay in sync with anything.
    <Panel
      title={name === undefined || !onRename ? (name ?? t('plans.headerTitle')) : undefined}
      leading={
        name === undefined || !onRename ? undefined : (
          <TextInput
            ref={nameRef}
            size="sm"
            value={draftName ?? name}
            aria-label={t('plans.headerName')}
            onFocus={() => setDraftName(name ?? '')}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraftName(null);
              }
            }}
            className="w-56 max-w-full font-semibold"
          />
        )
      }
      className="lg:sticky lg:top-0 lg:z-10"
    >
      {/* A plain wrapping strip, like every other row of StatChips in the app. */}
      <div className="flex flex-wrap gap-2">
        <StatChip label={t('plans.headerTrainingTime')} value={formatCountdown(totalSeconds)} />
        <StatChip label={t('plans.headerSkillCount')} value={skillCount} />
        <StatChip
          label={t('plans.headerProjectedFinish')}
          value={projectedFinish ? formatLocalDate(projectedFinish) : t('plans.headerNoFinish')}
        />
        {progress && progressFraction !== null && (
          <StatChip
            label={t('plans.headerTrained')}
            value={
              trainedKnown ? (
                <>
                  {Math.floor(progressFraction * 100)}%{' '}
                  <span className="text-text-dim">
                    {t('plans.headerTrainedSp', {
                      trained: formatCompactNumber(progress.trainedSp),
                      total: formatCompactNumber(progress.totalSp),
                    })}
                  </span>
                </>
              ) : (
                '—'
              )
            }
          />
        )}
        {nextMilestone && (
          <StatChip
            label={t('plans.milestone.next')}
            value={
              <>
                <span
                  title={nextMilestone.name}
                  className="inline-block max-w-[8rem] overflow-hidden text-ellipsis whitespace-nowrap align-bottom md:max-w-none md:overflow-visible"
                >
                  {nextMilestone.name}
                </span>{' '}
                <span className="text-text-dim">{formatLocalDate(nextMilestone.finish)}</span>
              </>
            }
          />
        )}
        {badge && (
          <StatChip
            label={t('plans.headerSavingsLabel')}
            tone={showsSavings ? 'success' : 'default'}
            value={
              <>
                {showsSavings ? formatCountdown(savingsSeconds) : t('plans.headerSavingsNone')}
                {badge.capped && (
                  <span className="ml-1 text-text-dim">
                    {t('plans.remapCapNote', { count: badge.evaluatedRemapCount })}
                  </span>
                )}
              </>
            }
          />
        )}
        {whatIf && (
          <StatChip
            testId="what-if-chip"
            label={t('plans.whatIfChip.label', { lens: whatIf.lens })}
            tone={WHAT_IF_TONE[whatIf.verdict.kind]}
            value={t(`plans.whatIfChip.${whatIf.verdict.kind}`, {
              duration: formatCountdown(whatIf.verdict.seconds),
            })}
          />
        )}
      </div>
    </Panel>
  );
}
