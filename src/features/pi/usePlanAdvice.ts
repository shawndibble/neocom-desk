import { useMemo } from 'react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { buildPlanAdvice, type PlanAdvice } from './planAdviceModel';
import { usePiAdviceInputs } from './usePiAdviceInputs';

export type PlanAdviceState =
  | { status: 'loading' }
  | { status: 'prices-failed' }
  | { status: 'error' }
  | { status: 'ready'; advice: PlanAdvice; pricesFetchedAt: Date; hubName: string };

/** The Plan tab's advice: the shared inputs (`usePiAdviceInputs`) run through the one model. */
export function usePlanAdvice(
  snapshot: GoalPlannerSnapshot,
  characterId: number,
  preference: RebuildPreference
): PlanAdviceState {
  const inputs = usePiAdviceInputs(snapshot, characterId, preference);
  return useMemo((): PlanAdviceState => {
    if (inputs.status !== 'ready') return inputs;
    try {
      return {
        status: 'ready',
        advice: buildPlanAdvice(inputs.input),
        pricesFetchedAt: inputs.prices.fetchedAt,
        hubName: inputs.hubName,
      };
    } catch {
      return { status: 'error' };
    }
  }, [inputs]);
}
