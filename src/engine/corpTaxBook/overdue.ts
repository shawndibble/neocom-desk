/**
 * Overdue (D19, D29): an unsettled Statement goes Overdue N days (14 by
 * default) after it is issued; no interest, reminders are manual. A miner's
 * declaration ("paid by contract / other division / wrong corp") pauses the
 * clock for at most 14 days, after which it resumes on its own with a note.
 * An officer confirming the declaration ends the pause there; rejecting it
 * gives a fresh 14 days from the rejection.
 */

export const DEFAULT_OVERDUE_DAYS = 14;
export const DECLARATION_PAUSE_DAYS = 14;

const DAY_MS = 86_400_000;

export interface Declaration {
  id: string;
  statementId: string;
  kind: 'contract' | 'other-division' | 'wrong-corp';
  at: string;
  note?: string;
  resolution?: { kind: 'confirmed' | 'rejected'; at: string; reason?: string };
}

export type OverdueState = 'settled' | 'open' | 'paused' | 'overdue';

export interface OverdueStatus {
  state: OverdueState;
  /** When it goes (or went) Overdue, with every pause counted. */
  overdueAt: string;
  /** While paused: when the pause ends on its own. */
  pausedUntil?: string;
  /** A declaration ran its full 14 days unanswered and the clock resumed. */
  resumedAfterPause: boolean;
}

export interface OverdueInput {
  issuedAt: string;
  /** From `allocatePayments`. */
  settled: boolean;
  now: string;
  /** This Statement's declarations. */
  declarations: readonly Declaration[];
  overdueDays?: number;
}

export function overdueStatus(input: OverdueInput): OverdueStatus {
  const now = Date.parse(input.now);
  const cap = DECLARATION_PAUSE_DAYS * DAY_MS;
  // Each declaration's pause window, merged so overlapping ones count once.
  const windows = input.declarations
    .map((d) => {
      const start = Date.parse(d.at);
      const capped = start + cap;
      const end = d.resolution ? Math.min(Date.parse(d.resolution.at), capped) : capped;
      return { start, end, unanswered: !d.resolution };
    })
    .sort((a, b) => a.start - b.start);
  let paused = 0;
  let cursor = -Infinity;
  for (const w of windows) {
    const start = Math.max(w.start, cursor);
    if (w.end > start) paused += w.end - start;
    cursor = Math.max(cursor, w.end);
  }

  let overdueAt =
    Date.parse(input.issuedAt) + (input.overdueDays ?? DEFAULT_OVERDUE_DAYS) * DAY_MS + paused;
  for (const d of input.declarations) {
    if (d.resolution?.kind === 'rejected') {
      overdueAt = Math.max(overdueAt, Date.parse(d.resolution.at) + cap);
    }
  }

  const active = windows.filter((w) => w.start <= now && now < w.end);
  const resumedAfterPause = windows.some((w) => w.unanswered && now >= w.end);
  const base = { overdueAt: new Date(overdueAt).toISOString(), resumedAfterPause };
  if (input.settled) return { state: 'settled', ...base };
  if (active.length > 0) {
    const until = Math.max(...active.map((w) => w.end));
    return { state: 'paused', ...base, pausedUntil: new Date(until).toISOString() };
  }
  return { state: now >= overdueAt ? 'overdue' : 'open', ...base };
}
