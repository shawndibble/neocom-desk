/**
 * The steps a contract has been through, for the detail panel's timeline in
 * place of separate Issued / Accepted / Completed / Expires date rows. Pure.
 *
 * A contract that has not been accepted shows "accepted" as waiting and ends
 * on its expiry, which is the next thing that will happen to it. `done` steps
 * carry the instant; a step that has not happened carries `null` (or, for the
 * expiry, when it will).
 */
import type { Contract } from '@/esi/endpoints';
import { parseInstant } from '@/engine/esiInstant';
import { MINUTE_MS } from '@/lib/age';

/** Statuses of a contract that ended without being completed. ESI dates none of them. */
const OUTCOME_STATUSES = ['cancelled', 'deleted', 'rejected', 'failed', 'reversed'] as const;
type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export type TimelineStepKey =
  'issued' | 'accepted' | 'completed' | 'expires' | 'expired' | OutcomeStatus;

export interface TimelineStep {
  key: TimelineStepKey;
  done: boolean;
  /** Epoch ms; `null` for a step that has not happened and has no date. */
  atMs: number | null;
  /** Completed in the same minute as the step before it was accepted: shown as "Same minute", not a second stamp. */
  sameMinuteAsPrevious?: boolean;
}

/**
 * `nowMs` decides whether an unaccepted contract has lapsed: ESI keeps it
 * "outstanding" past its expiry, so the status alone cannot say. Passed in, not
 * read here, because an engine does not read the clock.
 */
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
  // A completed contract was accepted whether or not ESI stamped it, and one
  // that was withdrawn, rejected or has lapsed can no longer be accepted: only a
  // live, unfinished contract shows the step, as waiting.
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
