import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import type { ScheduledStep } from '@/engine/types';
import { formatDuration } from '@/lib/duration';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

interface ComputedQueueProps {
  steps: readonly ScheduledStep[];
  nameFor: (skillTypeID: number) => string;
  /** Skills the user actually added; steps for any other skill are prereq-inserted. */
  userSkillTypeIDs: ReadonlySet<number>;
  /** True when the plan has at least one entry the current catalog recognizes — distinguishes "nothing added yet" from "added, but already trained" (UX-REVIEW #9). */
  hasValidEntries: boolean;
}

/** Read-only normalized + scheduled training queue. Prereq-inserted rows render dimmed. */
export function ComputedQueue({
  steps,
  nameFor,
  userSkillTypeIDs,
  hasValidEntries,
}: ComputedQueueProps) {
  const { t } = useTranslation();

  if (steps.length === 0) {
    return (
      <EmptyState
        title={hasValidEntries ? t('plans.computedQueueAllTrained') : t('plans.computedQueueEmpty')}
        className="py-4"
      />
    );
  }

  return (
    <div className="rounded-xs border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        <span className="flex-1" />
        <span className="w-16 text-right">{t('plans.columnPerLevel')}</span>
        <span className="w-16 text-right">{t('plans.columnCumulative')}</span>
      </div>
      <ul>
        {steps.map((step) => {
          const isPrereq = !userSkillTypeIDs.has(step.skillTypeID);
          return (
            <li
              key={`${step.skillTypeID}-${step.level}`}
              className={`flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
                isPrereq ? 'text-text-faint italic' : ''
              }`}
            >
              <span className="flex-1 truncate">
                {nameFor(step.skillTypeID)} {ROMAN[step.level - 1]}
                {isPrereq && (
                  <span className="ml-2 text-[0.625rem] uppercase">{t('plans.prereq')}</span>
                )}
              </span>
              <span className="w-16 text-right tabular-nums text-text-dim">
                {formatDuration(step.seconds)}
              </span>
              <span className="w-16 text-right tabular-nums">
                {formatDuration(step.cumulativeSeconds)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
