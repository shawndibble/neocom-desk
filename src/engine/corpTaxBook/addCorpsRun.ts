/**
 * The guided "Add my other corps" run: a queue of corporations the player is
 * CEO of, signed in one by one. Pure state, no storage; `useAddCorpsRun`
 * persists it, because EVE's login leaves the page between corporations.
 */
import { shiftUtcDate } from '@/engine/localDay';

export interface AddCorpsCandidate {
  corporationId: number;
  ceoCharacterId: number;
  name: string;
  ceoName: string;
}

/** How one corporation ended (or, for `wrong-character`, where it stands). */
export type AddCorpsOutcome =
  | { kind: 'connected' }
  | { kind: 'skipped' }
  | { kind: 'wrong-character'; signedInAs: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'cancelled' };

export interface AddCorpsRun {
  collectorCorporationId: number;
  editorCharacterId: number;
  /** UTC day (YYYY-MM-DD) the moon owners' ledgers count from. */
  coverageFrom?: string;
  queue: AddCorpsCandidate[];
  /** Index of the corporation being signed in; `queue.length` when finished. */
  index: number;
  outcomes: Record<number, AddCorpsOutcome>;
  /** The latest outcome, for the banner on the next screen. */
  lastOutcome?: { corporationId: number; outcome: AddCorpsOutcome };
}

/** The player's pick for "How far back?". */
export type CoverageChoice = 'today' | 7 | 14 | 30;

export function startRun(args: {
  collectorCorporationId: number;
  editorCharacterId: number;
  queue: AddCorpsCandidate[];
  coverageFrom?: string;
}): AddCorpsRun {
  return {
    collectorCorporationId: args.collectorCorporationId,
    editorCharacterId: args.editorCharacterId,
    ...(args.coverageFrom === undefined ? {} : { coverageFrom: args.coverageFrom }),
    queue: args.queue,
    index: 0,
    outcomes: {},
  };
}

/** A corporation is finished once it holds any outcome but a wrong-character one. */
function finished(run: AddCorpsRun, corporationId: number): boolean {
  const outcome = run.outcomes[corporationId];
  return outcome !== undefined && outcome.kind !== 'wrong-character';
}

/** Move to the first unfinished corporation at or after the current one. */
export function advance(run: AddCorpsRun): AddCorpsRun {
  let index = run.index;
  while (index < run.queue.length && finished(run, run.queue[index]!.corporationId)) index += 1;
  return index === run.index ? run : { ...run, index };
}

export function current(run: AddCorpsRun): AddCorpsCandidate | undefined {
  return run.queue[run.index];
}

export function isDone(run: AddCorpsRun): boolean {
  return run.index >= run.queue.length;
}

export function progress(run: AddCorpsRun): { done: number; total: number } {
  const done = run.queue.filter((c) => finished(run, c.corporationId)).length;
  return { done, total: run.queue.length };
}

/**
 * Record how the current corporation went. A wrong character leaves the run on
 * the same corporation; every other outcome (a refusal included) finishes it
 * and moves on.
 */
export function recordOutcome(run: AddCorpsRun, outcome: AddCorpsOutcome): AddCorpsRun {
  const corp = current(run);
  if (!corp) return run;
  const next: AddCorpsRun = {
    ...run,
    outcomes: { ...run.outcomes, [corp.corporationId]: outcome },
    lastOutcome: { corporationId: corp.corporationId, outcome },
  };
  return advance(next);
}

export function skip(run: AddCorpsRun): AddCorpsRun {
  return recordOutcome(run, { kind: 'skipped' });
}

/** End the run now; outcomes so far stay for the result screen. */
export function stop(run: AddCorpsRun): AddCorpsRun {
  return { ...run, index: run.queue.length };
}

/** The UTC day a "How far back?" choice counts from, fixed once for the whole batch. */
export function coverageFromForChoice(choice: CoverageChoice, today: string): string {
  return choice === 'today' ? today : shiftUtcDate(today, -choice);
}

/**
 * Put one corporation back on the sign-in list: its outcome is forgotten and
 * the run is on it again. A run that had ended is open again; later corporations
 * that already finished stay finished, so `advance` skips past them afterwards.
 */
export function retry(run: AddCorpsRun, corporationId: number): AddCorpsRun {
  const index = run.queue.findIndex((c) => c.corporationId === corporationId);
  if (index < 0) return run;
  const outcomes = { ...run.outcomes };
  delete outcomes[corporationId];
  const next: AddCorpsRun = { ...run, index, outcomes };
  delete next.lastOutcome;
  return next;
}
