import type { GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import type { PlanAdvice, PlanAdviceInput } from '../planAdviceModel';
import { useAdviceOf } from '../useAdviceOf';
import { usePiAdviceInputs } from '../usePiAdviceInputs';
import { usePiSnapshot } from '../usePiSnapshot';

export interface ColoniesAdviceState {
  snapshot: GoalPlannerSnapshot | null;
  advice: PlanAdvice | null;
  input: PlanAdviceInput | null;
  failed: boolean;
  pricesFailed: boolean;
}

export function useColoniesAdvice(
  characterId: number | null,
  reloadKey: number
): ColoniesAdviceState {
  const { snapshot, failed } = usePiSnapshot(characterId, reloadKey);

  const inputs = usePiAdviceInputs(snapshot, characterId, 'isk', reloadKey);
  const built = useAdviceOf(inputs.status === 'ready' ? inputs.input : null);
  const advice = built.status === 'ready' ? built.advice : null;

  return {
    snapshot,
    advice,
    input: inputs.status === 'ready' ? inputs.input : null,
    failed,
    pricesFailed: inputs.status === 'prices-failed',
  };
}
