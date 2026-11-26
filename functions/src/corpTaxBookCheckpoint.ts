import { DAY_MS, utcDay } from './timeConstants.js';

export interface CheckpointOwedDay {
  date: string;
  remaining: number;
  tax?: number;
  credited?: number;
  writtenOff?: number;
  charge?: number;
  held?: boolean;
}

export interface RunningAccountCheckpoint {
  minerId: string;
  through: string;
  owed: CheckpointOwedDay[];
  credit: number;
  balance: number;
  paidThrough: string | null;
  characterIds?: number[];
  at: string;
  by?: number;
}

export function checkpointFits(
  checkpoint: Pick<RunningAccountCheckpoint, 'characterIds'>,
  characterIds: readonly number[]
): boolean {
  const held = checkpoint.characterIds;
  if (!held || held.length !== characterIds.length) return false;
  const now = new Set(characterIds);
  return held.every((c) => now.has(c)) && now.size === held.length;
}

export function lockDateFor(today: string): string {
  const [y, m] = today.split('-').map(Number);
  return utcDay(Date.UTC(y, m - 3, 1));
}

export function snapshotThroughFor(today: string): string {
  return utcDay(Date.parse(`${lockDateFor(today)}T00:00:00Z`) - DAY_MS);
}

export function isLocked(date: string | undefined, today: string): boolean {
  return !!date && date.slice(0, 10) < lockDateFor(today);
}

export function isSnapshot(checkpoint: Pick<RunningAccountCheckpoint, 'through' | 'at'>): boolean {
  return checkpoint.through <= snapshotThroughFor(checkpoint.at.slice(0, 10));
}

export function dismissalWaives(
  d: { from?: string; reversed?: { from?: string } | null },
  date: string
): boolean {
  if (d.from !== undefined && date < d.from) return false;
  return !d.reversed || (d.reversed.from !== undefined && date < d.reversed.from);
}

export type CheckpointProblem =
  | 'owed-order'
  | 'owed-after-through'
  | 'owed-remaining'
  | 'owed-figures'
  | 'owed-charge'
  | 'credit'
  | 'balance'
  | 'paid-through';

const close = (a: number, b: number) => Math.abs(a - b) < 1;

export function checkpointProblems(
  c: Pick<RunningAccountCheckpoint, 'through' | 'owed' | 'credit' | 'balance' | 'paidThrough'>
): CheckpointProblem[] {
  const out: CheckpointProblem[] = [];
  const add = (p: CheckpointProblem, when: boolean) => {
    if (when && !out.includes(p)) out.push(p);
  };
  for (let i = 1; i < c.owed.length; i++) add('owed-order', c.owed[i].date <= c.owed[i - 1].date);
  add(
    'owed-after-through',
    c.owed.some((d) => d.date > c.through)
  );
  add(
    'owed-remaining',
    c.owed.some((d) => !(d.remaining > 0))
  );
  add(
    'owed-figures',
    c.owed.some(
      (d) =>
        d.tax === undefined ||
        d.credited === undefined ||
        !(d.credited >= 0) ||
        !((d.writtenOff ?? 0) >= 0) ||
        !close(d.remaining, d.tax - d.credited - (d.writtenOff ?? 0))
    )
  );
  add(
    'owed-charge',
    c.owed.some((d) => d.charge !== undefined && !(d.charge >= 0 && d.charge <= d.remaining))
  );
  add('credit', !(c.credit >= 0));
  const owed = c.owed.filter((d) => !d.held).reduce((sum, d) => sum + d.remaining, 0);
  add('balance', !close(c.balance, owed - c.credit));
  const syncOwed = c.owed.find((d) => !d.held && d.remaining - (d.charge ?? 0) >= 1);
  add(
    'paid-through',
    c.paidThrough !== null &&
      (c.paidThrough > c.through || (syncOwed !== undefined && c.paidThrough >= syncOwed.date))
  );
  return out;
}
