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
  /**
   * CEO Characters whose closed-app alerts approval follows their corporation's
   * moon sign-in, while the player is still signed in to that EVE account
   * (issue #6103). Absent or empty: the run asks for no alerts.
   */
  alertsFor?: number[];
  /** The corporation whose CEO's alerts approval is the step now, after it connected. */
  alertsStep?: { corporationId: number; signedInAs?: string };
  /** How the latest alerts approval ended, for the note on the next screen. */
  lastAlerts?: { corporationId: number; kind: AlertsStepOutcome['kind'] };
}

/** How a chained alerts approval came back. A wrong character keeps the step. */
export type AlertsStepOutcome =
  | { kind: 'on' }
  | { kind: 'failed' }
  | { kind: 'cancelled' }
  | { kind: 'skipped' }
  | { kind: 'wrong-character'; signedInAs: string };

/** The player's pick for "How far back?". */
export type CoverageChoice = 'today' | 7 | 14 | 30;

export function startRun(args: {
  collectorCorporationId: number;
  editorCharacterId: number;
  queue: AddCorpsCandidate[];
  coverageFrom?: string;
  alertsFor?: number[];
}): AddCorpsRun {
  return {
    collectorCorporationId: args.collectorCorporationId,
    editorCharacterId: args.editorCharacterId,
    ...(args.coverageFrom === undefined ? {} : { coverageFrom: args.coverageFrom }),
    queue: args.queue,
    ...(args.alertsFor?.length ? { alertsFor: args.alertsFor } : {}),
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

/** The corporation whose CEO's alerts approval is pending, if that is the step now. */
export function currentAlerts(run: AddCorpsRun): AddCorpsCandidate | undefined {
  const step = run.alertsStep;
  return step && run.queue.find((c) => c.corporationId === step.corporationId);
}

export function isDone(run: AddCorpsRun): boolean {
  return run.index >= run.queue.length && run.alertsStep === undefined;
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
  // Only a connected corp chains: the player has just signed in as its CEO at EVE.
  if (outcome.kind === 'connected' && run.alertsFor?.includes(corp.ceoCharacterId)) {
    next.alertsStep = { corporationId: corp.corporationId };
  }
  return advance(next);
}

/**
 * Record how the chained alerts approval went. A wrong character keeps the step
 * (nothing was approved); anything else ends it, and that CEO is not asked again.
 */
export function recordAlertsOutcome(run: AddCorpsRun, outcome: AlertsStepOutcome): AddCorpsRun {
  const corp = currentAlerts(run);
  if (!corp) return run;
  if (outcome.kind === 'wrong-character') {
    return {
      ...run,
      alertsStep: { corporationId: corp.corporationId, signedInAs: outcome.signedInAs },
    };
  }
  const alertsFor = (run.alertsFor ?? []).filter((id) => id !== corp.ceoCharacterId);
  const next: AddCorpsRun = {
    ...run,
    alertsFor,
    lastAlerts: { corporationId: corp.corporationId, kind: outcome.kind },
  };
  delete next.alertsStep;
  if (alertsFor.length === 0) delete next.alertsFor;
  return next;
}

export function skip(run: AddCorpsRun): AddCorpsRun {
  return recordOutcome(run, { kind: 'skipped' });
}

/** End the run now; outcomes so far stay for the result screen. */
export function stop(run: AddCorpsRun): AddCorpsRun {
  const next: AddCorpsRun = { ...run, index: run.queue.length };
  delete next.alertsStep;
  return next;
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
