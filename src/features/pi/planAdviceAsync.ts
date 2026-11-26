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
