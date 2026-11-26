import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, StatChip, StatChips, TextInput, Tooltip, type StatChipTone } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { formatCompactNumber } from '@/lib/compactNumber';
import type { PlanProgress } from '@/engine/skills/planProgress';
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
  badge: OptimizationBadge | null;
  nextMilestone: { name: string; finish: Date } | null;
  progress?: PlanProgress;
  whatIf?: { lens: string; verdict: WhatIfVerdict } | null;
  savingsShrankWithImplants?: boolean;
  trainedKnown?: boolean;
  name?: string;
  onRename?: (name: string) => void;
  focusName?: boolean;
}

export function PlanHeader({
  totalSeconds,
  skillCount,
  projectedFinish,
  badge,
  nextMilestone,
  progress,
  whatIf = null,
  savingsShrankWithImplants = false,
  trainedKnown = true,
  name,
  onRename,
  focusName = false,
}: PlanHeaderProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const nameRef = useRef<HTMLInputElement>(null);
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
      <StatChips>
        <StatChip label={t('plans.headerTrainingTime')} value={formatCountdown(totalSeconds)} />
        <StatChip label={t('plans.headerSkillCount')} value={skillCount} />
        <StatChip
          label={t('plans.headerProjectedFinish')}
          value={
            projectedFinish ? formatLocalDate(projectedFinish, timeZone) : t('plans.headerNoFinish')
          }
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
                <Tooltip content={nextMilestone.name}>
                  <span
                    tabIndex={0}
                    className={`inline-block max-w-[8rem] overflow-hidden rounded-xs text-ellipsis whitespace-nowrap align-bottom md:max-w-none md:overflow-visible ${focusRingClassName}`}
                  >
                    {nextMilestone.name}
                  </span>
                </Tooltip>{' '}
                <span className="text-text-dim">
                  {formatLocalDate(nextMilestone.finish, timeZone)}
                </span>
              </>
            }
          />
        )}
        {badge && (
          <StatChip
            label={t('plans.headerSavingsLabel')}
            tooltipGlyph="info"
            tooltip={
              savingsShrankWithImplants ? t('plans.headerSavingsShrankWithImplants') : undefined
            }
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
      </StatChips>
    </Panel>
  );
}
