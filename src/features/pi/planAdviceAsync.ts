/**
 * One `PlanAdviceInput` answered off the main thread when the browser has a
 * Worker, and on the page when it has not (jsdom, a failed worker). The same
 * answer either way: both run `buildPlanAdvice`. For derived inputs a hook
 * cannot hold (what-if variants, one alt Character's colonies).
 */
import { buildPlanAdvice } from './planAdviceModel';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';
import {
  askPlanAdvice,
  planAdviceWorkerAvailable,
  PlanAdviceWorkerUnavailable,
} from './planAdviceService';

export async function askAdvice(input: PlanAdviceInput): Promise<PlanAdvice> {
  if (planAdviceWorkerAvailable()) {
    try {
      return await askPlanAdvice(input);
    } catch (error) {
      if (!(error instanceof PlanAdviceWorkerUnavailable)) throw error;
    }
  }
  return buildPlanAdvice(input);
}
