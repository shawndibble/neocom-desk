import type { Contract } from '@/esi/endpoints';
import { parseInstant } from '@/engine/esiInstant';
import { MINUTE_MS } from '@/lib/age';

const OUTCOME_STATUSES = ['cancelled', 'deleted', 'rejected', 'failed', 'reversed'] as const;
type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export type TimelineStepKey =
  'issued' | 'accepted' | 'completed' | 'expires' | 'expired' | OutcomeStatus;

export interface TimelineStep {
  key: TimelineStepKey;
  done: boolean;
  atMs: number | null;
  sameMinuteAsPrevious?: boolean;
}

export function contractTimeline(contract: Contract, nowMs: number): TimelineStep[] {
  const issued = parseInstant(contract.date_issued);
  const accepted = parseInstant(contract.date_accepted);
  const completed = parseInstant(contract.date_completed);
  const expires = parseInstant(contract.date_expired);
  const outcome = OUTCOME_STATUSES.find((status) => status === contract.status);
  const lapsed =
    outcome === undefined &&
    completed === null &&
    accepted === null &&
    contract.status === 'outstanding' &&
    expires !== null &&
    expires <= nowMs;
  const steps: TimelineStep[] = [{ key: 'issued', done: true, atMs: issued }];
  if (accepted !== null || (completed === null && outcome === undefined && !lapsed)) {
    steps.push({ key: 'accepted', done: accepted !== null, atMs: accepted });
  }
  if (completed !== null) {
    steps.push({
      key: 'completed',
      done: true,
      atMs: completed,
      ...(accepted !== null
        ? {
            sameMinuteAsPrevious:
              Math.floor(accepted / MINUTE_MS) === Math.floor(completed / MINUTE_MS),
          }
        : {}),
    });
  } else if (outcome !== undefined) {
    steps.push({ key: outcome, done: true, atMs: null });
  } else if (lapsed) {
    steps.push({ key: 'expired', done: true, atMs: expires });
  } else {
    steps.push({ key: 'expires', done: false, atMs: expires });
  }
  return steps;
}
