import type { TFunction } from 'i18next';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer';
import type { StepKey } from '@/engine/skills/skillPlanSchedule';
import type { Attributes, PlanEntry, PlanStep, TrainedSkill } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import type { OptimizeVerdict } from './optimizeVerdict';
import { schedulePlanWith, type PlanScheduleInputs, type SchedulablePlan } from './planSchedule';

/** Shared "Added N skill(s)" wording for both import paths that only ever append (clipboard, queue Append). */
export function appendedCountMessage(
  t: TFunction,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  imported: readonly PlanEntry[]
): string {
  const addedCount = imported.filter(
    (entry) => (trainedSkills.get(entry.skillTypeID)?.level ?? 0) < entry.targetLevel
  ).length;
  return addedCount > 0
    ? t('plans.importAddedCount', { count: addedCount })
    : t('plans.importAddedNone');
}

export function yearlyRemapAfterNote(t: TFunction, date: Date, timeZone?: 'UTC'): string {
  return t('plans.optimizeConfirmYearlyAfter', { date: formatLocalDate(date, timeZone) });
}

// Same beside-the-button confirmation for both Optimize Modes: the savings
// figure when meaningful, otherwise *why* there is none. A run that placed
// no remap at all — nothing to spend, or every marker at the plan's end —
// is a no-op, not a finding about the plan, and saying "no meaningful
// savings" for it sends the user off fixing the wrong thing.
export function confirmRemapOutcome(
  t: TFunction,
  verdict: OptimizeVerdict,
  yearlyRemapAfter?: Date,
  timeZone?: 'UTC'
): string {
  switch (verdict.kind) {
    case 'saves': {
      const saves = t('plans.optimizeConfirmSaves', {
        duration: formatCountdown(verdict.savingsSeconds),
      });
      return yearlyRemapAfter
        ? `${saves}. ${yearlyRemapAfterNote(t, yearlyRemapAfter, timeZone)}`
        : saves;
    }
    case 'noRemapsAvailable':
      return t('plans.optimizeConfirmNoRemaps');
    case 'markersAtEnd':
      return t('plans.optimizeConfirmMarkersAtEnd');
    case 'noGain':
      return t('plans.optimizeConfirmNoGain');
  }
}

/** What `pricedAfterApply` costs a candidate against: the plan's own schedule inputs. */
export interface PricingContext {
  schedulablePlan: SchedulablePlan;
  scheduleInputs: PlanScheduleInputs;
  loadedAtMs: number;
  /** The base attributes a fallback "keep current attributes" segment is reported under. */
  attributes: Attributes;
}

/**
 * What `optimizeAtMarkers` (via `schedulePlan`) actually reports for a
 * candidate `(entries, markers)` pair — the SAME costing Accept's write
 * will show afterwards, redundant-marker drop and entry-snap included.
 * Every optimize-and-preview flow re-prices through this before showing a
 * segment count or a savings figure, so the preview never promises a remap
 * that Accept goes on to drop as redundant. `markers.length === 0` (every
 * proposed remap turned out redundant) reports `schedulePlan`'s own
 * `markersResult: null` as the same "keep current attributes" baseline
 * `placeRemaps` itself falls back to when no remap beats it.
 */
export function pricedAfterApply(
  { schedulablePlan, scheduleInputs, loadedAtMs, attributes }: PricingContext,
  finalEntries: readonly PlanEntry[],
  finalMarkers: readonly number[]
): { order: PlanStep[]; remaps: PlaceRemapsResult } {
  // Override: candidate entries/markers, and `markerAttributes: []` on purpose —
  // it matches what `applyOptimizerRemapSegments` writes (skillPlanEdit.ts), so the
  // preview costs exactly what Accept will leave behind.
  const finalSchedule = schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs, {
    entries: [...finalEntries],
    markers: [...finalMarkers],
    markerAttributes: [],
  });
  const remaps: PlaceRemapsResult = finalSchedule.markersResult ?? {
    segments:
      finalSchedule.scheduled.length > 0
        ? [
            {
              startIndex: 0,
              endIndex: finalSchedule.scheduled.length - 1,
              attributes,
              seconds: finalSchedule.totalSeconds,
              remap: false,
            },
          ]
        : [],
    totalSeconds: finalSchedule.totalSeconds,
    currentSeconds: finalSchedule.totalSeconds,
    savingsSeconds: 0,
  };
  return { order: finalSchedule.scheduled, remaps };
}

/** Each segment's first step, by key — see `stepKey`. */
export function anchorKeysOf(
  stepKeys: readonly StepKey[],
  segments: readonly RemapSegment[]
): (StepKey | undefined)[] {
  return segments.map((segment) => stepKeys[segment.startIndex]);
}

/** The toast "Optimize queue" leaves behind for a plan it made. */
export function optimizeQueueMadeMessage(
  t: TFunction,
  name: string,
  made: { savingsSeconds: number; remapsPlaced: number; yearlyRemapAfter?: Date },
  firstSkill: string,
  timeZone?: 'UTC'
): string {
  const duration = formatCountdown(made.savingsSeconds);
  const what =
    made.remapsPlaced > 1
      ? t('plans.optimizeQueueWhatMany', { count: made.remapsPlaced, duration })
      : t('plans.optimizeQueueWhatOne', { skill: firstSkill, duration });
  const wait = made.yearlyRemapAfter
    ? t('plans.optimizeQueueYearlyWait', { date: formatLocalDate(made.yearlyRemapAfter, timeZone) })
    : '';
  return t('plans.optimizeQueueMade', { name, what, wait });
}
