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

export type TimelineStepKey = 'issued' | 'accepted' | 'completed' | 'expires';

export interface TimelineStep {
  key: TimelineStepKey;
  done: boolean;
  /** Epoch ms; `null` for a step that has not happened and has no date. */
  atMs: number | null;
  /** Completed in the same minute as the step before it was accepted: shown as "Same minute", not a second stamp. */
  sameMinuteAsPrevious?: boolean;
}

const MINUTE_MS = 60_000;

export function contractTimeline(contract: Contract): TimelineStep[] {
  const issued = parseInstant(contract.date_issued);
  const accepted = parseInstant(contract.date_accepted);
  const completed = parseInstant(contract.date_completed);
  const expires = parseInstant(contract.date_expired);
  const steps: TimelineStep[] = [{ key: 'issued', done: true, atMs: issued }];
  // A completed contract was accepted whether or not ESI stamped it, so only an
  // unfinished one shows the step, as waiting.
  if (accepted !== null || completed === null) {
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
  } else {
    steps.push({ key: 'expires', done: false, atMs: expires });
  }
  return steps;
}
