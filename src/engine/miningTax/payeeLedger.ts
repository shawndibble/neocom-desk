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

export interface LedgerCharge {
  id: string;
  date: string;
  kind: 'mined' | 'correction';
  tax: number;
  place?: string;
  ore?: readonly OreLine[];
  reason?: string;
  open?: boolean;
  opening?: boolean;
  reversed?: { at: string; reason?: string };
}

export interface LedgerPayment {
  id: string;
  at: string;
  from?: string;
  note?: string;
  href?: string;
  source?: 'donation' | 'manual';
  via?: 'journal' | 'contract' | 'recorded' | 'legacy' | 'marked';
  to?: string;
  notTax?: number;
  amount?: number;
}

export interface LedgerWriteOff {
  id: string;
  at: string;
  amount: number;
  reason?: string;
  reversed?: { at: string; reason?: string };
}

export interface LedgerNotice {
  id: string;
  issuedAt: string;
  kind: LateNoticeKind;
  lines: readonly Pick<LateNoticeLine, 'date' | 'tax'>[];
}

export interface PayeeLedgerSource {
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
  opening?: { through: string; balance: number };
  charges: readonly LedgerCharge[];
  payments?: readonly LedgerPayment[];
  marked?: readonly { id: string; at: string; date: string | null; amount: number }[];
  writeOffs?: readonly LedgerWriteOff[];
  notices?: readonly LedgerNotice[];
  notYetBilled?: { tax: number; days: number };
}

export type PayeeLedgerKind = 'charge' | 'payment' | 'writeOff' | 'notice';

interface RowBase {
  key: string;
  date: string;
  at?: string;
  charged: number;
  paid: number;
  balance: number;
  reversed?: boolean;
  reversal?: boolean;
}

export type PayeeLedgerRow =
  | (RowBase & {
      kind: 'charge';
      charge: LedgerCharge;
      held: boolean;
    })
  | (RowBase & {
      kind: 'payment';
      payment: LedgerPayment;
      days: DayAmount[];
      credit: number;
    })
  | (RowBase & {
      kind: 'writeOff';
      cause: 'officer' | 'tolerance';
      days: DayAmount[];
      reason?: string;
    })
  | (RowBase & { kind: 'notice'; notice: LedgerNotice; standing: LateNoticeStanding })
  | (RowBase & { kind: 'opening' });

export type PayeeLedgerStatus =
  | { kind: 'owes'; amount: number; days: number; oldest: string }
  | { kind: 'paid'; through: string }
  | { kind: 'none' };

export interface PayeeLedger {
  rows: PayeeLedgerRow[];
  status: PayeeLedgerStatus;
  credit: number;
  notYetBilled: { tax: number; days: number };
}

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
