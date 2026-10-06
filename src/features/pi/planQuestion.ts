import { PLAN_CUSTOMS_HASH } from './piPlanLink';

/** The three questions the Plan tab opens on. */
export type PlanQuestion = 'make-more' | 'find-best' | 'product';

export interface OpeningQuestion {
  question: PlanQuestion;
  /** Why it opened there: the one-line note under the picker. */
  reason: 'colonies' | 'no-colonies' | 'goals';
}

/**
 * Which question Plan opens on. A link that names a product (`?goals=`, or a
 * seeded `?type=`) goes to the Goal Planner whatever else is true; otherwise a
 * pilot with colonies is asked what to do with them, and one without is shown
 * what to build.
 */
export function openingQuestion(input: {
  goalCount: number;
  colonyCount: number;
}): OpeningQuestion {
  if (input.goalCount > 0) return { question: 'product', reason: 'goals' };
  if (input.colonyCount > 0) return { question: 'make-more', reason: 'colonies' };
  return { question: 'find-best', reason: 'no-colonies' };
}

/**
 * The question the pilot picked, or the one a `#customs` link forces. A pick
 * made on an earlier visit to the same `#customs` URL (another `location.key`)
 * no longer overrides it; with no hash, a pick always stands.
 */
export function pickedQuestion(
  pick: { question: PlanQuestion; key: string } | null,
  hash: string,
  locationKey: string
): PlanQuestion | null {
  if (hash !== PLAN_CUSTOMS_HASH) return pick?.question ?? null;
  return pick?.key === locationKey ? pick.question : 'product';
}
