/**
 * A running account's figures as the pay page reads them (#6294): the server cannot price days,
 * so an officer's client records each Miner's account (`recordAccounts`) and the verify link
 * shows it, less what the Miner paid since (`liveAccount`, functions).
 */
import {
  canAdvanceCheckpoint,
  closedThroughFor,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import type { BookView } from './bookView';
import { MinerRunningAccount } from './minerRunningAccount';
import { paymentNet } from './payments';
import { savedPrice } from './billableLines';

/** One Miner's account as `recordAccounts` takes it. */
export interface AccountRecord {
  minerId: string;
  owed: number;
  /** The Miner's net payments counted (less "not tax"): later ones come off `owed` on the server. */
  paid: number;
  /** Money ahead of every billed day. */
  credit: number;
  days: number;
  oldest?: string;
  paidThrough?: string;
  /**
   * The running days still owed, oldest first, with what remains of each: what the verify page
   * lists as "Still owed". Absent from an older client, and then the page reads the notice's lines.
   */
  unpaidDays?: { date: string; owed: number; tax: number }[];
  /**
   * The newest day to store as paid for good (`meta/paid`), when every day up to it is paid and
   * saved-price: only the officer's client can know, the server has no prices.
   */
  settledThrough?: string;
}

/**
 * Each Miner's account in the view, whole ISK; `only` keeps one Miner (a page scoped to them
 * reads only their rows, so no other Miner's figure is whole).
 */
export function accountRecords(view: BookView, only?: string): AccountRecord[] {
  const paidBy = new Map<string, number>();
  for (const p of view.input.payments)
    if (p.minerId) paidBy.set(p.minerId, (paidBy.get(p.minerId) ?? 0) + paymentNet(p));
  return view.miners.flatMap((m) => {
    if (only !== undefined && m.id !== only) return [];
    const { owes, paidThrough, closableThrough } = m.account;
    const unpaidDays = [...(view.internals.byMiner.get(m.id)?.account.byDay ?? [])]
      .filter(([, d]) => !d.settled && !d.held && Math.round(d.remaining) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        owed: Math.round(d.remaining),
        tax: Math.round(d.tax),
      }));
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

/**
 * The checkpoints due now (decision 20261120-235011): each Miner's account closed through the end
 * of the last month at least 31 days old, where that moves the stored one forward. Only an
 * officer's client can work them out: the server has no prices. Only from a read of the WHOLE
 * book: a page read for one Miner cannot see the groupings around them.
 */
export function dueCheckpoints(
  view: BookView,
  recorded: { at: string; by: number }
): RunningAccountCheckpoint[] {
  const today = recorded.at.slice(0, 10);
  const through = closedThroughFor(today);
  if (through < view.input.startDate) return [];
  return view.miners.flatMap((m) => {
    const inner = view.internals.byMiner.get(m.id);
    if (!inner) return [];
    // A checkpoint is history kept for good: only days the book bills for certain go in it. Every
    // day up to `through` must be billable (no moon owner's hold, no sync gap) and priced at a
    // saved close-of-day price, as `closableThrough` asks of a day stored as paid.
    if (inner.billableThrough === undefined || inner.billableThrough < through) return [];
    if (!inner.billable.lines.every((l) => l.date > through || savedPrice(l))) return [];
    const stored = inner.account.input.checkpoint;
    if (!canAdvanceCheckpoint(stored, { through }, today)) return [];
    // Nothing billed and no money: nothing to close.
    if (inner.billable.lines.length === 0 && inner.payments.length === 0 && !stored) return [];
    return [MinerRunningAccount.checkpoint(inner.account.input, m.id, through, recorded)];
  });
}
