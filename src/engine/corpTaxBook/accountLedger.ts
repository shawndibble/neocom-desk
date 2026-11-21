/**
 * A Miner's account as one ordered ledger: every moon-tax debit and every payment, write-off and
 * correction credit, oldest first, with the balance after each. It reads what the Miner page
 * already shows in separate tables (`MinerDetail`), so an accountant can follow the total without
 * re-adding two lists by hand.
 *
 * Balance is debits less credits: positive is owed, negative is credit held with the book. The
 * last balance always equals the page's Owed less Credit held (`MinerRow`). A tolerance shortfall
 * forgiven, or money taken back from a day already closed, is that day's own `tolerance` row, dated by
 * the payment that closed it. The rows add up to the balance, so there is no catch-all row.
 */
import type { Adjustment } from './adjustments';
import type { MinerDetail } from './bookView';

/** `checkpoint`: what the account stood at on the day it is closed through. */
export type LedgerEntryKind =
  'checkpoint' | 'day' | 'payment' | 'correction' | 'writeOff' | 'tolerance';

export interface LedgerEntry {
  /** Unique within the ledger. */
  key: string;
  kind: LedgerEntryKind;
  /** The UTC day it belongs to, `YYYY-MM-DD`. */
  date: string;
  debit: number;
  credit: number;
  /** After this entry: positive is owed, negative is credit held. */
  balance: number;
  /** A `day` entry: how many mined days (a moon each) it adds up. */
  days?: number;
  /** A `day` entry: the mined days (`DayRow.key`) behind it, for the row to open onto. */
  dayKeys?: string[];
  /** A `payment`, `correction` or `writeOff` entry: what the member or officer recorded. */
  note?: string;
  /** A `payment` entry: who sent it and how the book learned of it. */
  paymentId?: string;
  /** The record behind a `correction` (its Adjustment id) or `writeOff` (the write-off id) row. */
  refId?: string;
  /** A `correction` row that is the balance rolled over from another system. */
  opening?: boolean;
  /** A `tolerance` row: the mined day whose shortfall it closed. */
  forDate?: string;
  /** A correction or write-off an officer undid: this row is the original, shown struck through. */
  reversed?: boolean;
  /** This row undoes the one before it (same record), dated the day the officer undid it. */
  reversal?: boolean;
}

export interface AccountLedger {
  entries: LedgerEntry[];
  /** Positive is owed, negative is credit held; equals the last entry's balance. */
  balance: number;
  /** Mined but not billable yet: shown below, outside the balance. */
  notYetBilled: { tax: number; days: number };
  /** Owed days an open dispute holds: shown below as held, outside the balance. */
  held: { tax: number; days: number };
}

/** Within one date a day's tax comes first, then what was paid against it. */
const ORDER: Record<LedgerEntryKind, number> = {
  checkpoint: -1,
  day: 0,
  correction: 1,
  payment: 2,
  writeOff: 2,
  tolerance: 3,
};

const day = (iso: string) => iso.slice(0, 10);

export function accountLedger(
  detail: MinerDetail,
  corrections: readonly Adjustment[]
): AccountLedger {
  type Draft = Omit<LedgerEntry, 'balance'> & { at: string };
  const drafts: Draft[] = [];
  const notYetBilled = { tax: 0, days: 0 };
  const heldTotal = { tax: 0, days: 0 };
  // A closed-through checkpoint opens the ledger: what came before it is summed up in it.
  const cp = detail.checkpoint;
  const open = (date: string) => !cp || date > cp.through;
  if (cp)
    drafts.push({
      key: 'checkpoint',
      kind: 'checkpoint',
      date: cp.through,
      at: cp.through,
      debit: Math.max(0, cp.balance),
      credit: Math.max(0, -cp.balance),
    });

  // The account owes every Billable day; a date an open dispute holds is not billed yet.
  const billed = new Map<string, { debit: number; days: number; keys: string[] }>();
  // A date an open dispute holds is not billed yet, so it stays out of the balance.
  const held = new Set(detail.heldDays);
  for (const d of detail.days) {
    if (d.tax <= 0) continue;
    const owedNow = d.status === 'paid' || (d.status === 'owed' && !held.has(d.date));
    if (owedNow) {
      if (!open(d.date)) continue;
      const held = billed.get(d.date) ?? { debit: 0, days: 0, keys: [] };
      held.debit += d.tax;
      held.days += 1;
      held.keys.push(d.key);
      billed.set(d.date, held);
    } else if (d.status === 'owed') {
      heldTotal.tax += d.tax;
      heldTotal.days += 1;
    } else if (d.status === 'not-billable') {
      notYetBilled.tax += d.tax;
      notYetBilled.days += 1;
    }
  }
  for (const [date, v] of billed)
    drafts.push({
      key: `day-${date}`,
      kind: 'day',
      date,
      at: date,
      debit: v.debit,
      credit: 0,
      days: v.days,
      dayKeys: v.keys,
    });

  for (const p of detail.payments)
    if (p.credited > 0 && open(day(p.at)))
      drafts.push({
        key: `payment-${p.id}`,
        kind: 'payment',
        date: day(p.at),
        at: p.at,
        debit: 0,
        credit: p.credited,
        paymentId: p.id,
      });
  for (const a of corrections) {
    if (a.amount === 0 || !open(a.date)) continue;
    const debit = Math.max(0, a.amount);
    const credit = Math.max(0, -a.amount);
    drafts.push({
      key: `correction-${a.id}`,
      kind: 'correction',
      date: a.date,
      at: a.at,
      debit,
      credit,
      note: a.reason,
      refId: a.id,
      ...(a.kind === 'opening' ? { opening: true } : {}),
      ...(a.reversed ? { reversed: true } : {}),
    });
    // An undone correction stays, with an offsetting row on the day it was undone.
    if (a.reversed)
      drafts.push({
        key: `correction-${a.id}-reversal`,
        kind: 'correction',
        date: day(a.reversed.at),
        at: a.reversed.at,
        debit: credit,
        credit: debit,
        note: a.reversed.reason,
        refId: a.id,
        ...(a.kind === 'opening' ? { opening: true } : {}),
        reversal: true,
      });
  }
  for (const w of detail.officerWriteOffs) {
    if (w.amount <= 0 || !open(day(w.at))) continue;
    drafts.push({
      key: `writeOff-${w.id}`,
      kind: 'writeOff',
      date: day(w.at),
      at: w.at,
      debit: 0,
      credit: w.amount,
      note: w.reason,
      refId: w.id,
      ...(w.reversed ? { reversed: true } : {}),
    });
    if (w.reversed)
      drafts.push({
        key: `writeOff-${w.id}-reversal`,
        kind: 'writeOff',
        date: day(w.reversed.at),
        at: w.reversed.at,
        debit: w.amount,
        credit: 0,
        note: w.reversed.reason,
        refId: w.id,
        reversal: true,
      });
  }

  for (const w of detail.dayWriteOffs)
    drafts.push({
      key: `tolerance-${w.date}`,
      kind: 'tolerance',
      date: day(w.at),
      at: w.at,
      debit: 0,
      credit: w.amount,
      note: w.date,
      forDate: w.date,
    });
  drafts.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDER[a.kind] - ORDER[b.kind] ||
      a.at.localeCompare(b.at) ||
      a.key.localeCompare(b.key)
  );

  let balance = 0;
  const entries = drafts.map((d): LedgerEntry => {
    balance += d.debit - d.credit;
    return {
      key: d.key,
      kind: d.kind,
      date: d.date,
      debit: d.debit,
      credit: d.credit,
      balance,
      ...(d.days !== undefined ? { days: d.days } : {}),
      ...(d.dayKeys !== undefined ? { dayKeys: d.dayKeys } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
      ...(d.paymentId !== undefined ? { paymentId: d.paymentId } : {}),
      ...(d.reversed ? { reversed: true } : {}),
      ...(d.reversal ? { reversal: true } : {}),
      ...(d.refId !== undefined ? { refId: d.refId } : {}),
      ...(d.opening ? { opening: true } : {}),
      ...(d.forDate !== undefined ? { forDate: d.forDate } : {}),
    };
  });
  return { entries, balance, notYetBilled, held: heldTotal };
}
