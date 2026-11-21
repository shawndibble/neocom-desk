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
import { utcDay } from '../localDay';
import type { OreLine } from './types';

/** What the ledger reads off a Running account (`MinerRunningAccount`, for either kind of Payee). */
export type LedgerAccount = Pick<
  MinerRunningAccount,
  'byDay' | 'applications' | 'credit' | 'balance' | 'paidThrough' | 'owes'
>;

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
}

/** An officer's write-off, as the account was given it. */
export interface LedgerWriteOff {
  id: string;
  /** ISO instant it was recorded. */
  at: string;
  amount: number;
  reason?: string;
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
  account: LedgerAccount;
  /**
   * The closed-through checkpoint the account starts from (`RunningAccountCheckpoint`): one
   * opening row stands for every day through it, and no charge on or before it is listed again.
   */
  opening?: { through: string; balance: number };
  charges: readonly LedgerCharge[];
  payments?: readonly LedgerPayment[];
  /** In the order they were recorded; absent for a personal Payee. */
  writeOffs?: readonly LedgerWriteOff[];
  /** Absent for a personal Payee. */
  notices?: readonly LedgerNotice[];
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
}

/** A row before the running balance. */
type Unbalanced<R = PayeeLedgerRow> = R extends PayeeLedgerRow ? Omit<R, 'balance'> : never;

const dayOf = (at: string) => utcDay(Date.parse(at));

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
    ...officerWriteOffRows(source),
    ...toleranceRows(source),
    ...(source.notices ?? []).map((notice): Unbalanced => ({
      kind: 'notice',
      key: `notice:${notice.id}`,
      date: dayOf(notice.issuedAt),
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
  return { rows: balanced, status: statusOf(account), credit: account.credit };
}

function statusOf(account: LedgerAccount): PayeeLedgerStatus {
  if (account.owes) return { kind: 'owes', ...account.owes };
  if (account.paidThrough) return { kind: 'paid', through: account.paidThrough };
  return { kind: 'none' };
}

function chargeRows({ account, charges }: PayeeLedgerSource): Unbalanced[] {
  return charges.map((charge) => ({
    kind: 'charge',
    key: `charge:${charge.id}`,
    date: charge.date,
    charged: charge.tax,
    paid: 0,
    charge,
    held: account.byDay.get(charge.date)?.held ?? false,
  }));
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
        date: dayOf(payment.at),
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

/** What officer write-offs forgave, poured into them in the order they were recorded. */
function officerWriteOffRows({ account, writeOffs = [] }: PayeeLedgerSource): Unbalanced[] {
  const forgiven = account.applications.writeOffs.map((d) => ({ ...d }));
  let head = 0;
  return [...writeOffs]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((w) => {
      const days: DayAmount[] = [];
      let left = Math.max(0, w.amount);
      while (left > 0 && head < forgiven.length) {
        const day = forgiven[head]!;
        const take = Math.min(left, day.amount);
        days.push({ date: day.date, amount: take });
        day.amount -= take;
        left -= take;
        if (day.amount <= 0) head += 1;
      }
      return {
        kind: 'writeOff',
        cause: 'officer',
        key: `writeOff:${w.id}`,
        date: dayOf(w.at),
        at: w.at,
        charged: 0,
        paid: days.reduce((sum, d) => sum + d.amount, 0),
        days,
        ...(w.reason ? { reason: w.reason } : {}),
      };
    });
}

/**
 * What a day's tolerance wrote off, on the payment that closed the day (the last one to reach
 * it), so it reads right after that payment; a day no payment reached, on the day itself.
 */
function toleranceRows({ account, payments = [] }: PayeeLedgerSource): Unbalanced[] {
  const described = new Map(payments.map((p) => [p.id, p]));
  const closedBy = new Map<string, LedgerPayment>();
  for (const p of account.applications.payments) {
    const payment = described.get(p.paymentId);
    if (payment) for (const d of p.days) closedBy.set(d.date, payment);
  }
  const groups = new Map<string, { date: string; at?: string; days: DayAmount[] }>();
  for (const [date, day] of account.byDay) {
    if (day.writtenOff <= 0) continue;
    const payment = closedBy.get(date);
    const key = payment ? `tolerance:${payment.id}` : `tolerance:${date}`;
    const group =
      groups.get(key) ??
      (payment ? { date: dayOf(payment.at), at: payment.at, days: [] } : { date, days: [] });
    group.days.push({ date, amount: day.writtenOff });
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
