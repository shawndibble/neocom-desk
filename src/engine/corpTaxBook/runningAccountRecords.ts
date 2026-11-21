/**
 * A running account's figures as the pay page reads them (#6294): the server cannot price days,
 * so an officer's client records each Miner's account (`recordAccounts`), with its snapshot when
 * one is due, and the verify link shows it, less what the Miner paid since (`liveRunningAccount`,
 * functions).
 */
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

/** One Miner's account as `recordAccounts` takes it. */
export interface RunningAccountRecord {
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
  unpaidDays?: OwedDay[];
  /**
   * The newest day to store as paid for good (`meta/paid`), when every day up to it is paid and
   * saved-price: only the officer's client can know, the server has no prices.
   */
  settledThrough?: string;
  /** Its snapshot for the lock date, when one is due (`dueCheckpoints`). */
  snapshot?: RunningAccountCheckpoint;
}

/**
 * Each Miner's account in the view, whole ISK; `only` keeps one Miner (a page scoped to them
 * reads only their rows, so no other Miner's figure is whole).
 */
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

/**
 * The snapshots due now (decision 20261120-235011, "a lock date"): each Miner's account through
 * the day before the lock date (`snapshotThroughFor`), for a Miner with no snapshot at that date
 * yet, once per lock date. Only an officer's client can work them out: the server has no prices.
 * Only from a read of the WHOLE book: a page read for one Miner cannot see the groupings around
 * them.
 */
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
    // A checkpoint is history kept for good: only days the book bills for certain go in it. Every
    // day up to `through` must be billable (no moon owner's hold, no sync gap) and priced at a
    // saved close-of-day price, as `closableThrough` asks of a day stored as paid.
    if (inner.billableThrough === undefined || inner.billableThrough < through) return [];
    if (!inner.billable.lines.every((l) => l.date > through || savedPrice(l))) return [];
    const stored = inner.account.input.checkpoint;
    if (stored && stored.through >= through) return [];
    // Nothing billed and no money: nothing to close.
    if (inner.billable.lines.length === 0 && inner.payments.length === 0 && !stored) return [];
    return [
      MinerRunningAccount.checkpoint(inner.account.input, m.id, through, {
        ...recorded,
        characterIds: inner.characterIds,
      }),
    ];
  });
}
