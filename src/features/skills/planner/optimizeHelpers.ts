import type { TFunction } from 'i18next';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer';
import type { StepKey } from '@/engine/skills/skillPlanSchedule';
import type { Attributes, PlanEntry, PlanStep, TrainedSkill } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import type { OptimizeVerdict } from './optimizeVerdict';
import { schedulePlanWith, type PlanScheduleInputs, type SchedulablePlan } from './planSchedule';

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

export interface PricingContext {
  schedulablePlan: SchedulablePlan;
  scheduleInputs: PlanScheduleInputs;
  loadedAtMs: number;
  attributes: Attributes;
}

export function pricedAfterApply(
  { schedulablePlan, scheduleInputs, loadedAtMs, attributes }: PricingContext,
  finalEntries: readonly PlanEntry[],
  finalMarkers: readonly number[]
): { order: PlanStep[]; remaps: PlaceRemapsResult } {
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

export function anchorKeysOf(
  stepKeys: readonly StepKey[],
  segments: readonly RemapSegment[]
): (StepKey | undefined)[] {
  return segments.map((segment) => stepKeys[segment.startIndex]);
}

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
