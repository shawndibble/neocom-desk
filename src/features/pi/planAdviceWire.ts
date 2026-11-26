import type { PiData } from '@/sde/types';
import type { PlannerSnapshot } from './goalPlannerModel';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';

export type WirePlanAdviceInput = Omit<PlanAdviceInput, 'snapshot'> & {
  snapshot: Omit<PlannerSnapshot, 'pi'>;
};

export type PlanAdviceRequest =
  | { kind: 'pi'; pi: PiData }
  | { kind: 'advice'; id: number; input: WirePlanAdviceInput }
  | { kind: 'cancel'; id: number };

export type PlanAdviceReply = { id: number; advice: PlanAdvice } | { id: number; error: string };

export const PI_NOT_LOADED = 'pi not loaded';

export function toWireInput(input: PlanAdviceInput): WirePlanAdviceInput {
  const { pi, ...snapshot } = input.snapshot;
  void pi;
  return { ...input, snapshot };
}
