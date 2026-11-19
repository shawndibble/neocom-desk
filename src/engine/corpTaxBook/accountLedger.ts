/**
 * A Miner's account as one ordered ledger: every moon-tax debit and every payment, write-off and
 * correction credit, oldest first, with the balance after each. It reads what the Miner page
 * already shows in separate tables (`MinerDetail`), so an accountant can follow the total without
 * re-adding two lists by hand.
 *
 * Balance is debits less credits: positive is owed, negative is credit held with the book. The
 * last balance always equals the page's Owed less Credit held (`MinerRow`). Money the engine
 * moves without a date of its own (a tolerance shortfall forgiven, a correction folded into a
 * Statement) is the one `adjustment` row, so nothing is hidden and nothing is double counted.
 */
import type { Adjustment } from './statements';
import type { MinerDetail } from './bookView';

export type LedgerEntryKind = 'day' | 'payment' | 'correction' | 'writeOff' | 'adjustment';

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
}

export interface AccountLedger {
  entries: LedgerEntry[];
  /** Positive is owed, negative is credit held; equals the last entry's balance. */
  balance: number;
  /** Mined but not billable yet (or waiting for a Statement): shown below, outside the balance. */
  notYetBilled: { tax: number; days: number };
}

/** Within one date a day's tax comes first, then what was paid against it. */
const ORDER: Record<LedgerEntryKind, number> = {
  day: 0,
  correction: 1,
  payment: 2,
  writeOff: 2,
  adjustment: 3,
};

const day = (iso: string) => iso.slice(0, 10);

export function accountLedger(
  detail: MinerDetail,
  corrections: readonly Adjustment[],
  running: boolean
): AccountLedger {
  type Draft = Omit<LedgerEntry, 'balance'> & { at: string };
  const drafts: Draft[] = [];
  const notYetBilled = { tax: 0, days: 0 };

  // A running account owes every billable day not yet on a Statement; a Statement-era book waits
  // for the Statement to bill it.
  const billed = new Map<string, { debit: number; days: number; keys: string[] }>();
  for (const d of detail.days) {
    if (d.tax <= 0) continue;
    // A day an officer forgave off a Statement was billed first; the write-off is its credit.
    const forgivenOnStatement = d.status === 'written-off' && d.statementId !== undefined;
    const owedNow =
      d.status === 'paid' ||
      d.status === 'on-statement' ||
      forgivenOnStatement ||
      (running && d.status === 'unbilled');
    if (owedNow) {
      const held = billed.get(d.date) ?? { debit: 0, days: 0, keys: [] };
      held.debit += d.tax;
      held.days += 1;
      held.keys.push(d.key);
      billed.set(d.date, held);
    } else if (d.status === 'unbilled' || d.status === 'not-billable') {
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
    if (p.credited > 0)
      drafts.push({
        key: `payment-${p.id}`,
        kind: 'payment',
        date: day(p.at),
        at: p.at,
        debit: 0,
        credit: p.credited,
        paymentId: p.id,
      });
  for (const a of corrections)
    if (a.amount !== 0)
      drafts.push({
        key: `correction-${a.id}`,
        kind: 'correction',
        date: day(a.at),
        at: a.at,
        debit: Math.max(0, a.amount),
        credit: Math.max(0, -a.amount),
        note: a.reason,
      });
  for (const w of detail.officerWriteOffs)
    if (w.amount > 0)
      drafts.push({
        key: `writeOff-${w.id}`,
        kind: 'writeOff',
        date: day(w.at),
        at: w.at,
        debit: 0,
        credit: w.amount,
        note: w.reason,
      });

  drafts.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDER[a.kind] - ORDER[b.kind] ||
      a.at.localeCompare(b.at) ||
      a.key.localeCompare(b.key)
  );

  // What the page states the account stands at; any gap is money the engine moved without a date.
  const expected = detail.row.owed - detail.row.credit;
  const summed = drafts.reduce((s, d) => s + d.debit - d.credit, 0);
  const gap = expected - summed;
  if (Math.abs(gap) >= 1)
    drafts.push({
      key: 'adjustment',
      kind: 'adjustment',
      date: drafts.at(-1)?.date ?? day(detail.row.lastPaidAt ?? new Date(0).toISOString()),
      at: '',
      debit: Math.max(0, gap),
      credit: Math.max(0, -gap),
    });

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
    };
  });
  return { entries, balance, notYetBilled };
}
