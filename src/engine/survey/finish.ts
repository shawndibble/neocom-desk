/**
 * Who may mark a Survey's field cleared. The scanner has nothing to copy once
 * the last rock is gone, so a Survey can't reach "finished" by a paste: the
 * owner may call it any time, and anyone holding the link may once it is
 * nearly done (99% mined, or past its "Done at" time), which is when the pilot who
 * started it has usually left. Pure:
 * the clock arrives as `now`.
 */
import type { SurveySummary } from './series';

/** `percent` tops out at 99 until the field is empty, so this is "99% or more". */
export const FINISH_AT_PERCENT = 99;

export function canFinishSurvey(
  summary: Pick<SurveySummary, 'finished' | 'percent' | 'etaAt'>,
  owned: boolean,
  now: number
): boolean {
  if (summary.finished) return false;
  if (owned) return true;
  if (summary.percent >= FINISH_AT_PERCENT) return true;
  // Past the estimated finish, the field should be gone by now.
  return summary.etaAt !== null && now >= summary.etaAt;
}
