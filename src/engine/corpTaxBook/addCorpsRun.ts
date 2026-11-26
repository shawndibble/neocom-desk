import { shiftUtcDate } from '@/engine/localDay';

export interface AddCorpsCandidate {
  corporationId: number;
  ceoCharacterId: number;
  name: string;
  ceoName: string;
}

export type AddCorpsOutcome =
  | { kind: 'connected' }
  | { kind: 'skipped' }
  | { kind: 'wrong-character'; signedInAs: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'cancelled' };

export interface AddCorpsRun {
  collectorCorporationId: number;
  editorCharacterId: number;
  coverageFrom?: string;
  queue: AddCorpsCandidate[];
  index: number;
  outcomes: Record<number, AddCorpsOutcome>;
  lastOutcome?: { corporationId: number; outcome: AddCorpsOutcome };
  alertsFor?: number[];
  alertsStep?: { corporationId: number; signedInAs?: string };
  lastAlerts?: { corporationId: number; kind: AlertsStepOutcome['kind'] };
}

export type AlertsStepOutcome =
  | { kind: 'on' }
  | { kind: 'failed' }
  | { kind: 'cancelled' }
  | { kind: 'skipped' }
  | { kind: 'wrong-character'; signedInAs: string };

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

function finished(run: AddCorpsRun, corporationId: number): boolean {
  const outcome = run.outcomes[corporationId];
  return outcome !== undefined && outcome.kind !== 'wrong-character';
}

export function advance(run: AddCorpsRun): AddCorpsRun {
  let index = run.index;
  while (index < run.queue.length && finished(run, run.queue[index]!.corporationId)) index += 1;
  return index === run.index ? run : { ...run, index };
}

export function current(run: AddCorpsRun): AddCorpsCandidate | undefined {
  return run.queue[run.index];
}

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

export function recordOutcome(run: AddCorpsRun, outcome: AddCorpsOutcome): AddCorpsRun {
  const corp = current(run);
  if (!corp) return run;
  const next: AddCorpsRun = {
    ...run,
    outcomes: { ...run.outcomes, [corp.corporationId]: outcome },
    lastOutcome: { corporationId: corp.corporationId, outcome },
  };
  if (outcome.kind === 'connected' && run.alertsFor?.includes(corp.ceoCharacterId)) {
    next.alertsStep = { corporationId: corp.corporationId };
  }
  return advance(next);
}

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

export function stop(run: AddCorpsRun): AddCorpsRun {
  const next: AddCorpsRun = { ...run, index: run.queue.length };
  delete next.alertsStep;
  return next;
}

export function coverageFromForChoice(choice: CoverageChoice, today: string): string {
  return choice === 'today' ? today : shiftUtcDate(today, -choice);
}

export function retry(run: AddCorpsRun, corporationId: number): AddCorpsRun {
  const index = run.queue.findIndex((c) => c.corporationId === corporationId);
  if (index < 0) return run;
  const outcomes = { ...run.outcomes };
  delete outcomes[corporationId];
  const next: AddCorpsRun = { ...run, index, outcomes };
  delete next.lastOutcome;
  return next;
}
