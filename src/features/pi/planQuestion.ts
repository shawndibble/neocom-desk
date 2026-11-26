import { optionalEnumParam } from '@/lib/urlState';
import { PLAN_CUSTOMS_HASH } from './piPlanLink';

export type PlanQuestion = 'make-more' | 'find-best' | 'product';

export interface OpeningQuestion {
  question: PlanQuestion;
  reason: 'colonies' | 'no-colonies' | 'goals';
}

export function openingQuestion(input: {
  goalCount: number;
  colonyCount: number;
}): OpeningQuestion {
  if (input.goalCount > 0) return { question: 'product', reason: 'goals' };
  if (input.colonyCount > 0) return { question: 'make-more', reason: 'colonies' };
  return { question: 'find-best', reason: 'no-colonies' };
}

export const PLAN_QUESTIONS = [
  'make-more',
  'find-best',
  'product',
] as const satisfies readonly PlanQuestion[];

export const planQuestionParam = optionalEnumParam<PlanQuestion>(PLAN_QUESTIONS);

export function pickedQuestion(
  urlQuestion: PlanQuestion | null,
  hash: string
): PlanQuestion | null {
  return hash === PLAN_CUSTOMS_HASH ? 'product' : urlQuestion;
}
