/**
 * A Payee ledger (decision 20261120-235011, "A Payee ledger"): every charge, payment, write-off
 * and late notice of one Payee's Running account in date order, with a running balance, and the
 * account's "Paid through" or "Owes" status. One shape for a Corp Tax Book Miner and a personal
 * Payee alike: the caller builds the Running account and says what each charge, payment, write-off
 * and notice was (`PayeeLedgerSource`); the money itself is read off the account, so the ledger
 * can never disagree with it.
 */
import {
  lateNoticeStanding,
  type LateNoticeKind,
  type LateNoticeLine,
  type LateNoticeStanding,
} from '../../../functions/src/corpTaxBookLateNotice';
import type { DayAmount, MinerRunningAccount } from '../corpTaxBook/minerRunningAccount';
import { utcDayOf } from '../localDay';
import { sum } from '../math';
import type { OreLine } from './types';

/** One line the account billed: a mined day's ore, or an officer's Adjustment. */
export interface LedgerCharge {
  /** Unique among the charges: a day charge's key, an Adjustment's id, an Assignment's id. */
  id: string;
  /** The EVE/UTC day it bills, `YYYY-MM-DD`. */
  date: string;
  kind: 'mined' | 'correction';
  /** Signed: a credit Adjustment is negative. */
  tax: number;
  /** The moon or refinery, already named; absent when unknown. */
  place?: string;
  ore?: readonly OreLine[];
  /** An Adjustment's reason. */
  reason?: string;
  /**
   * A day the account has not billed yet (not closed): listed and counted in the balance and what
   * is owed as it stands now, credit ahead of every billed day paying it first.
   */
  open?: boolean;
  /** An Adjustment that is the balance rolled over from another system. */
  opening?: boolean;
  /**
   * An Adjustment an officer undid: the account no longer counts it. It stays, struck through,
   * with a reversal row on the day it was undone, so the balance nets out.
   */
  reversed?: { at: string; reason?: string };
}

/** A payment the account counted, by its id there. Its amount and the days it paid come from the account. */
export interface LedgerPayment {
  id: string;
  /** ISO instant it arrived. */
  at: string;
  /** Who sent it, already named. */
  from?: string;
  /** An officer's note on a payment recorded by hand. */
  note?: string;
  /** Where it sits in a wallet, an in-app route: its row's detail links there. */
  href?: string;
  /** A wallet donation, or a payment an officer recorded by hand. */
  source?: 'donation' | 'manual';
  /**
   * What a personal Payee's payment is, so a pilot can tell them apart: a wallet transfer, a
   * contract paid in kind, a payment recorded in Settle up, one read from an old client's marks,
   * or a bare "Mark paid" (no money at all: it settled one day).
   */
  via?: 'journal' | 'contract' | 'recorded' | 'legacy' | 'marked';
  /** Who a personal payment was sent to (the Payee), already named. */
  to?: string;
  /** What an officer marked not tax: the account credits only the rest. */
  notTax?: number;
  /** A personal payment's full transfer amount, before any not-tax part or write-off. */
  amount?: number;
}

/** An officer's write-off, as the account was given it. */
export interface LedgerWriteOff {
  id: string;
  /** ISO instant it was recorded. */
  at: string;
  amount: number;
  reason?: string;
  /** Undone by an officer: the account counts nothing of it; shown with its reversal. */
  reversed?: { at: string; reason?: string };
}

/** A late notice sent (a `LateNotice` fits): an event, never an amount. */
export interface LedgerNotice {
  id: string;
  issuedAt: string;
  kind: LateNoticeKind;
  lines: readonly Pick<LateNoticeLine, 'date' | 'tax'>[];
}

/**
 * Everything a Payee ledger is built from. `charges`, `payments` and `writeOffs` are the inputs
 * the account was built from, described: a payment the account counted but this does not
 * describe has no date to stand on and is left out.
 */
export interface PayeeLedgerSource {
  /** What the ledger reads off a Running account (`MinerRunningAccount`, for either kind of Payee). */
  account: Pick<
    MinerRunningAccount,
    | 'byDay'
    | 'applications'
    | 'credit'
    | 'balance'
    | 'paidThrough'
    | 'owes'
    | 'writtenOffDays'
    | 'writeOffDays'
  >;
  /**
   * The closed-through checkpoint the account starts from (`RunningAccountCheckpoint`): one
   * opening row stands for every day through it, and no charge on or before it is listed again.
   */
  opening?: { through: string; balance: number };
  charges: readonly LedgerCharge[];
  payments?: readonly LedgerPayment[];
  /**
   * A personal Payee's bare "Mark paid"s (`PayeeRunningAccount.marked`): each shows as a Marked
   * paid row with what it settled of its own day, possibly nothing. Never money.
   */
  marked?: readonly { id: string; at: string; date: string | null; amount: number }[];
  /** In the order they were recorded; absent for a personal Payee. */
  writeOffs?: readonly LedgerWriteOff[];
  /** Absent for a personal Payee. */
  notices?: readonly LedgerNotice[];
  /** Mined but not billable yet: shown beside the ledger, never in its balance. */
  notYetBilled?: { tax: number; days: number };
}

export type PayeeLedgerKind = 'charge' | 'payment' | 'writeOff' | 'notice';

interface RowBase {
  key: string;
  /** The EVE/UTC day it stands on. */
  date: string;
  /** When it happened, an ISO instant; absent on a charge (a whole day) and a day closed by no payment. */
  at?: string;
  /** What it added to the balance (a charge's tax; negative for a credit Adjustment). */
  charged: number;
  /** What it took off the balance (a payment, or what a write-off forgave). */
  paid: number;
  /** The balance after it; negative is credit. */
  balance: number;
  /** A record an officer undid: shown struck through, its reversal follows on the day undone. */
  reversed?: boolean;
  /** The row undoing a reversed record. */
  reversal?: boolean;
}

export type PayeeLedgerRow =
  | (RowBase & {
      kind: 'charge';
      charge: LedgerCharge;
      /** An open dispute holds the day: not due, so it leaves the balance alone. */
      held: boolean;
    })
  | (RowBase & {
      kind: 'payment';
      payment: LedgerPayment;
      /** The days it paid, oldest first. */
      days: DayAmount[];
      /** What no day absorbed. */
      credit: number;
    })
  | (RowBase & {
      kind: 'writeOff';
      /** An officer forgave it, or the day's tolerance (or a recorded paid-through) closed it. */
      cause: 'officer' | 'tolerance';
      days: DayAmount[];
      reason?: string;
    })
  | (RowBase & { kind: 'notice'; notice: LedgerNotice; standing: LateNoticeStanding })
  /** The balance brought forward from the checkpoint: never filtered out. */
  | (RowBase & { kind: 'opening' });

/** "Owes X (N days, oldest D)", or "Paid through D", or nothing billed yet. */
export type PayeeLedgerStatus =
  | { kind: 'owes'; amount: number; days: number; oldest: string }
  | { kind: 'paid'; through: string }
  | { kind: 'none' };

export interface PayeeLedger {
  /** Oldest first. */
  rows: PayeeLedgerRow[];
  status: PayeeLedgerStatus;
  /** Money ahead of every billed day. */
  credit: number;
  /** Mined but not billable yet, outside the balance. */
  notYetBilled: { tax: number; days: number };
}

/** A row before the running balance. */
type Unbalanced<R = PayeeLedgerRow> = R extends PayeeLedgerRow ? Omit<R, 'balance'> : never;

export function payeeLedger(source: PayeeLedgerSource): PayeeLedger {
  const { account } = source;
  const { opening } = source;
  const rows: Unbalanced[] = [
    ...(opening
      ? [
          {
            kind: 'opening',
            key: 'opening',
            date: opening.through,
            charged: Math.max(0, opening.balance),
            paid: Math.max(0, -opening.balance),
          } as Unbalanced,
        ]
      : []),
    ...chargeRows(source).filter((r) => !opening || r.date > opening.through),
    ...paymentRows(source),
    ...markedRows(source),
    ...officerWriteOffRows(source),
    ...toleranceRows(source),
    ...(source.notices ?? []).map((notice): Unbalanced => ({
      kind: 'notice',
      key: `notice:${notice.id}`,
      date: utcDayOf(notice.issuedAt),
      at: notice.issuedAt,
      charged: 0,
      paid: 0,
      notice,
      standing: lateNoticeStanding(notice, account.byDay),
    })),
  ];
  // The opening row first; a day's charges come first (they are the day itself), then events in
  // the order they happened.
  rows.sort(
    (a, b) =>
      Number(b.kind === 'opening') - Number(a.kind === 'opening') ||
      a.date.localeCompare(b.date) ||
      Number(a.kind !== 'charge') - Number(b.kind !== 'charge') ||
      (a.at ?? '').localeCompare(b.at ?? '') ||
      Number(a.kind === 'writeOff') - Number(b.kind === 'writeOff') ||
      a.key.localeCompare(b.key)
  );
  let balance = 0;
  const balanced = rows.map((row) => {
    const moves = row.kind !== 'charge' || !row.held;
    balance += moves ? row.charged - row.paid : 0;
    return { ...row, balance } as PayeeLedgerRow;
  });
  const open = source.charges.filter((c) => c.open && !c.reversed);
  const openTax = sum(open.map((c) => c.tax));
  return {
    rows: balanced,
    status: statusOf(account, open, openTax),
    credit: Math.max(0, account.credit - openTax),
    notYetBilled: source.notYetBilled ?? { tax: 0, days: 0 },
  };
}

function statusOf(
  account: PayeeLedgerSource['account'],
  open: readonly LedgerCharge[],
  openTax: number
): PayeeLedgerStatus {
  // Open days are owed as they stand, after the credit ahead of every billed day, which pays the
  // oldest first: a day it covers is not owed.
  const openLeft = Math.max(0, openTax - account.credit);
  if (openLeft >= 0.5) {
    const byDate = new Map<string, number>();
    for (const c of open) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.tax);
    let credit = account.credit;
    const owedDates = [...byDate]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, tax]) => {
        const pay = Math.min(credit, tax);
        credit -= pay;
        return tax - pay >= 0.5;
      })
      .map(([date]) => date);
    const days = new Set(owedDates);
    const oldest = owedDates[0]!;
    return account.owes
      ? {
          kind: 'owes',
          amount: account.owes.amount + openLeft,
          days: account.owes.days + days.size,
          oldest: account.owes.oldest,
        }
      : { kind: 'owes', amount: openLeft, days: days.size, oldest };
  }
  if (account.owes) return { kind: 'owes', ...account.owes };
  if (account.paidThrough) return { kind: 'paid', through: account.paidThrough };
  return { kind: 'none' };
}

function chargeRows({ account, charges }: PayeeLedgerSource): Unbalanced[] {
  return charges.flatMap((charge): Unbalanced[] => {
    const row: Unbalanced = {
      kind: 'charge',
      key: `charge:${charge.id}`,
      date: charge.date,
      charged: charge.tax,
      paid: 0,
      charge,
      held: !charge.reversed && (account.byDay.get(charge.date)?.held ?? false),
      ...(charge.reversed ? { reversed: true } : {}),
    };
    if (!charge.reversed) return [row];
    // Undone: the original stays, struck through, and this row takes it back off.
    return [
      row,
      {
        kind: 'charge',
        key: `charge:${charge.id}:reversal`,
        date: utcDayOf(charge.reversed.at),
        at: charge.reversed.at,
        charged: -charge.tax,
        paid: 0,
        charge: {
          ...charge,
          ...(charge.reversed.reason ? { reason: charge.reversed.reason } : {}),
        },
        held: false,
        reversal: true,
      },
    ];
  });
}

function paymentRows({ account, payments = [] }: PayeeLedgerSource): Unbalanced[] {
  const described = new Map(payments.map((p) => [p.id, p]));
  return account.applications.payments.flatMap((applied): Unbalanced[] => {
    const payment = described.get(applied.paymentId);
    if (!payment) return [];
    return [
      {
        kind: 'payment',
        key: `payment:${payment.id}`,
        date: utcDayOf(payment.at),
        at: payment.at,
        charged: 0,
        paid: applied.days.reduce((sum, d) => sum + d.amount, applied.credit),
        payment,
        days: applied.days,
        credit: applied.credit,
      },
    ];
  });
}

function markedRows({ marked = [] }: PayeeLedgerSource): Unbalanced[] {
  return marked.map((m): Unbalanced => ({
    kind: 'payment',
    key: `payment:${m.id}`,
    date: utcDayOf(m.at),
    at: m.at,
    charged: 0,
    paid: m.amount,
    payment: { id: m.id, at: m.at, via: 'marked' },
    days: m.date !== null && m.amount > 0 ? [{ date: m.date, amount: m.amount }] : [],
    credit: 0,
  }));
}

/**
 * What officer write-offs forgave, poured into them in the order they were recorded. One an
 * officer undid forgave nothing: it shows its amount, and its reversal takes it back.
 */
function officerWriteOffRows({ account, writeOffs = [] }: PayeeLedgerSource): Unbalanced[] {
  const poured = account.writeOffDays();
  return writeOffs.flatMap((w): Unbalanced[] => {
    const reason = w.reason ? { reason: w.reason } : {};
    if (!w.reversed)
      return [
        {
          kind: 'writeOff',
          cause: 'officer',
          key: `writeOff:${w.id}`,
          date: utcDayOf(w.at),
          at: w.at,
          charged: 0,
          paid: (poured.get(w.id) ?? []).reduce((sum, d) => sum + d.amount, 0),
          days: poured.get(w.id) ?? [],
          ...reason,
        },
      ];
    return [
      {
        kind: 'writeOff',
        cause: 'officer',
        key: `writeOff:${w.id}`,
        date: utcDayOf(w.at),
        at: w.at,
        charged: 0,
        paid: Math.max(0, w.amount),
        days: [],
        ...reason,
        reversed: true,
      },
      {
        kind: 'writeOff',
        cause: 'officer',
        key: `writeOff:${w.id}:reversal`,
        date: utcDayOf(w.reversed.at),
        at: w.reversed.at,
        charged: Math.max(0, w.amount),
        paid: 0,
        days: [],
        ...(w.reversed.reason ? { reason: w.reversed.reason } : {}),
        reversal: true,
      },
    ];
  });
}

/**
 * What a day's tolerance wrote off, on the payment that closed the day (the last one to reach
 * it), so it reads right after that payment; a day no payment reached, on the day itself.
 */
function toleranceRows({ account, payments = [] }: PayeeLedgerSource): Unbalanced[] {
  const closing = new Map(payments.map((p) => [p.id, p]));
  const groups = new Map<string, { date: string; at?: string; days: DayAmount[] }>();
  for (const w of account.writtenOffDays(payments)) {
    const payment = w.paymentId === undefined ? undefined : closing.get(w.paymentId);
    const key = payment ? `tolerance:${payment.id}` : `tolerance:${w.date}`;
    const group =
      groups.get(key) ??
      (payment
        ? { date: utcDayOf(payment.at), at: payment.at, days: [] }
        : { date: w.date, days: [] });
    group.days.push({ date: w.date, amount: w.amount });
    groups.set(key, group);
  }
  return [...groups].map(([key, g]) => ({
    kind: 'writeOff',
    cause: 'tolerance',
    key,
    date: g.date,
    ...(g.at ? { at: g.at } : {}),
    charged: 0,
    paid: g.days.reduce((sum, d) => sum + d.amount, 0),
    days: g.days,
  }));
}
