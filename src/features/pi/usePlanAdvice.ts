import { useMemo } from 'react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import type { PlanAdvice } from './planAdviceModel';
import { useAdviceOf } from './useAdviceOf';
import { usePiAdviceInputs } from './usePiAdviceInputs';

export type PlanAdviceState =
  | { status: 'loading' }
  | { status: 'prices-failed'; advice: PlanAdvice | null }
  | { status: 'error' }
  | { status: 'ready'; advice: PlanAdvice; pricesFetchedAt: Date; hubName: string };

export function usePlanAdvice(
  snapshot: GoalPlannerSnapshot,
  characterId: number,
  preference: RebuildPreference
): PlanAdviceState {
  const inputs = usePiAdviceInputs(snapshot, characterId, preference);
  const built = useAdviceOf(inputs.status === 'loading' ? null : (inputs.input ?? null));
  return useMemo((): PlanAdviceState => {
    if (inputs.status === 'loading') return inputs;
    if (inputs.status === 'prices-failed') {
      if (!inputs.input) return { status: 'prices-failed', advice: null };
      if (built.status === 'pending') return { status: 'loading' };
      return { status: 'prices-failed', advice: built.status === 'ready' ? built.advice : null };
    }
    if (built.status === 'pending') return { status: 'loading' };
    if (built.status === 'error') return { status: 'error' };
    return {
      status: 'ready',
      advice: built.advice,
      pricesFetchedAt: inputs.prices.fetchedAt,
      hubName: inputs.hubName,
    };
  }, [inputs, built]);
}
