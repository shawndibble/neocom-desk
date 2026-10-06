import { useMemo } from 'react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { buildPlanAdvice, type PlanAdvice } from './planAdviceModel';
import { usePiAdviceInputs } from './usePiAdviceInputs';

export type PlanAdviceState =
  | { status: 'loading' }
  /** `advice` is built on empty books: only what needs no price survives, every ISK figure null. */
  | { status: 'prices-failed'; advice: PlanAdvice | null }
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
    if (inputs.status === 'loading') return inputs;
    if (inputs.status === 'prices-failed') {
      try {
        return {
          status: 'prices-failed',
          advice: inputs.input ? buildPlanAdvice(inputs.input) : null,
        };
      } catch {
        return { status: 'prices-failed', advice: null };
      }
    }
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
