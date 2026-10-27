/** What crosses the page / worker boundary for `buildPlanAdvice` (`planAdvice.worker.ts`, `planAdviceService.ts`). */
import type { PiData } from '@/sde/types';
import type { PlannerSnapshot } from './goalPlannerModel';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';

/** A `PlanAdviceInput` without the SDE slice, which travels separately. */
export type WirePlanAdviceInput = Omit<PlanAdviceInput, 'snapshot'> & {
  snapshot: Omit<PlannerSnapshot, 'pi'>;
};

export type PlanAdviceRequest =
  | { kind: 'pi'; pi: PiData }
  | { kind: 'advice'; id: number; input: WirePlanAdviceInput }
  /** Withdraws a queued `advice` request; one already running finishes and is ignored by the page. */
  | { kind: 'cancel'; id: number };

export type PlanAdviceReply = { id: number; advice: PlanAdvice } | { id: number; error: string };

/** The reply to a request that arrived before its SDE slice: a transport fault, not a model failure. */
export const PI_NOT_LOADED = 'pi not loaded';

export function toWireInput(input: PlanAdviceInput): WirePlanAdviceInput {
  const { pi, ...snapshot } = input.snapshot;
  void pi;
  return { ...input, snapshot };
}
