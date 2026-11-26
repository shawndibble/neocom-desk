import { utcDayOf } from '@/engine/localDay';
import {
  snapshotThroughFor,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import type { BookView } from './bookView';
import { MinerRunningAccount } from './minerRunningAccount';
import { netPayment } from './payments';
import type { OwedDay } from '../../../functions/src/corpTaxBookRunningAccounts';
import { savedPrice } from './billableLines';

export interface RunningAccountRecord {
  minerId: string;
  owed: number;
  paid: number;
  credit: number;
  days: number;
  oldest?: string;
  paidThrough?: string;
  unpaidDays?: OwedDay[];
  settledThrough?: string;
  snapshot?: RunningAccountCheckpoint;
}

export function runningAccountRecords(view: BookView, only?: string): RunningAccountRecord[] {
  const paidBy = new Map<string, number>();
  for (const p of view.input.payments)
    if (p.minerId) paidBy.set(p.minerId, (paidBy.get(p.minerId) ?? 0) + netPayment(p));
  const today = utcDayOf(view.input.now);
  return view.miners.flatMap((m) => {
    if (only !== undefined && m.id !== only) return [];
    const account = view.internals.byMiner.get(m.id)?.account;
    if (!account) return [];
    const { owes, paidThrough } = account;
    const closableThrough = account.closableThrough(today);
    const unpaidDays = account.owedDays();
    return [
      {
        minerId: m.id,
        owed: Math.round(m.owed),
        paid: Math.round(paidBy.get(m.id) ?? 0),
        credit: Math.max(0, Math.round(m.credit)),
        days: owes?.days ?? 0,
        ...(owes ? { oldest: owes.oldest } : {}),
        ...(paidThrough ? { paidThrough } : {}),
        unpaidDays,
        ...(closableThrough ? { settledThrough: closableThrough } : {}),
      },
    ];
  });
}

export function dueCheckpoints(
  view: BookView,
  recorded: { at: string; by: number }
): RunningAccountCheckpoint[] {
  const today = utcDayOf(recorded.at);
  const through = snapshotThroughFor(today);
  if (through < view.input.startDate) return [];
  return view.miners.flatMap((m) => {
    const inner = view.internals.byMiner.get(m.id);
    if (!inner) return [];
    if (inner.billableThrough === undefined || inner.billableThrough < through) return [];
    if (!inner.billable.lines.every((l) => l.date > through || savedPrice(l))) return [];
    const stored = inner.account.input.checkpoint;
    if (stored && stored.through >= through) return [];
    if (inner.billable.lines.length === 0 && inner.payments.length === 0 && !stored) return [];
    return [
      MinerRunningAccount.checkpoint(inner.account.input, m.id, through, {
        ...recorded,
        characterIds: inner.characterIds,
      }),
    ];
  });
}
