import type { SurveySummary } from './series';

export const FINISH_AT_PERCENT = 99;

export function canFinishSurvey(
  summary: Pick<SurveySummary, 'finished' | 'percent' | 'etaAt'>,
  owned: boolean,
  now: number
): boolean {
  if (summary.finished) return false;
  if (owned) return true;
  if (summary.percent >= FINISH_AT_PERCENT) return true;
  return summary.etaAt !== null && now >= summary.etaAt;
}
