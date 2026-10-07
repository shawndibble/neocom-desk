import { optionalEnumParam } from '@/lib/urlState';
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

/** Every question, as `?q=` spells it. */
export const PLAN_QUESTIONS = [
  'make-more',
  'find-best',
  'product',
] as const satisfies readonly PlanQuestion[];

/** `?q=`: the question the pilot picked (ADR 0015). Absent or unreadable: the opening question applies. */
export const planQuestionParam = optionalEnumParam<PlanQuestion>(PLAN_QUESTIONS);

/**
 * The question to show over the opening one: a `#customs` link forces the Goal
 * Planner (where the rate is edited); otherwise the URL's `?q=`. Picking a
 * question drops the hash, so a pick always stands.
 */
export function pickedQuestion(
  urlQuestion: PlanQuestion | null,
  hash: string
): PlanQuestion | null {
  return hash === PLAN_CUSTOMS_HASH ? 'product' : urlQuestion;
}
