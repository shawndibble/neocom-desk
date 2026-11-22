/**
 * Show Info › Interactions, Corporation scope, corp book rows: what the Corp Tax Book holds about
 * one player (their Miner). Pure; `corpFacts.ts` reads the book and hands these facts over. The
 * tax figures are the book's own (`buildBookView`), never re-derived here.
 */
import type { Interaction } from '@/engine/interactions/interactions';
import { formatIskCompact } from '@/lib/isk';
import type { Translate } from '@/lib/translate';
import { paymentWalletHref } from '@/features/corp/moons/paymentWalletHref';
import { minerPath } from '@/features/corp/moons/moonsPaths';

export interface BookNoticeFact {
  id: string;
  /** ISO instant. */
  issuedAt: string;
  /** The first and last day it listed (`YYYY-MM-DD`). */
  from: string;
  to: string;
  /** What its lines asked for. */
  listed: number;
  mailsSent: number;
  /** Every day it listed is paid on the Miner's Running account. */
  settled: boolean;
}

export interface BookPaymentFact {
  id: string;
  /** ISO instant. */
  at: string;
  amount: number;
  /** It paid at least one day; else it is all credit. */
  paidDays: boolean;
}

export interface BookAdjustmentFact {
  id: string;
  /** The mined day it corrects (`YYYY-MM-DD`). */
  date: string;
  /** ISO instant. */
  at: string;
  amount: number;
  reason: string;
}

export interface BookDayFact {
  /** `YYYY-MM-DD`. */
  date: string;
  tax: number;
  /** Nothing more is owed on this day. */
  settled: boolean;
}

/** What the corp book says about one player, from the Miner the player's characters bill under. */
export interface BookFacts {
  minerId: string;
  standing: 'member' | 'guest' | 'left';
  /** What the Miner owes now. */
  owed: number;
  notices: readonly BookNoticeFact[];
  payments: readonly BookPaymentFact[];
  adjustments: readonly BookAdjustmentFact[];
  days: readonly BookDayFact[];
}

/** An ISO instant or day as epoch ms (a bare day is read as UTC midnight). */
const ms = (iso: string): number => Date.parse(iso);

export function bookInteractions(facts: BookFacts, t: Translate): Interaction[] {
  const to = minerPath(facts.minerId);
  const out: Interaction[] = [];

  // One mining row per day: the Miner's characters and refineries add up.
  const byDate = new Map<string, { tax: number; settled: boolean }>();
  for (const d of facts.days) {
    if (d.tax <= 0) continue;
    const day = byDate.get(d.date) ?? { tax: 0, settled: true };
    day.tax += d.tax;
    day.settled = day.settled && d.settled;
    byDate.set(d.date, day);
  }
  for (const [date, day] of byDate) {
    out.push({
      id: `book-mining-${facts.minerId}-${date}`,
      kind: 'book',
      at: ms(date),
      type: 'interactions.type.mining',
      tone: 'neutral',
      title: t('interactions.corp.mining.title', { date }),
      detail: t('interactions.corp.mining.detail', { tax: formatIskCompact(day.tax) }),
      state: day.settled ? 'interactions.state.settled' : 'interactions.state.unpaid',
      stateTone: day.settled ? 'success' : 'warning',
      to,
    });
  }

  for (const n of facts.notices) {
    const mailed =
      n.mailsSent > 0
        ? t('interactions.corp.notice.mailed', { count: n.mailsSent })
        : t('interactions.corp.notice.notMailed');
    out.push({
      id: `book-notice-${n.id}`,
      kind: 'book',
      at: ms(n.issuedAt),
      type: 'interactions.type.lateNotice',
      tone: 'warning',
      title: t('interactions.corp.notice.title', { from: n.from, to: n.to }),
      detail: t('interactions.corp.notice.detail', {
        amount: formatIskCompact(n.listed),
        mailed,
      }),
      state: n.settled ? 'interactions.state.settled' : 'interactions.state.unpaid',
      stateTone: n.settled ? 'success' : 'warning',
      to,
    });
  }

  for (const p of facts.payments) {
    out.push({
      id: `book-payment-${p.id}`,
      kind: 'book',
      at: ms(p.at),
      type: 'interactions.type.payment',
      tone: 'success',
      title: t('interactions.corp.payment.title'),
      detail: t(
        p.paidDays ? 'interactions.corp.payment.paidDays' : 'interactions.corp.payment.credit'
      ),
      isk: p.amount,
      to: paymentWalletHref(p.id) ?? to,
    });
  }

  for (const a of facts.adjustments) {
    out.push({
      id: `book-adjustment-${a.id}`,
      kind: 'book',
      at: ms(a.at),
      type: 'interactions.type.adjustment',
      tone: 'neutral',
      title: t('interactions.corp.adjustment.title', { date: a.date }),
      detail: t('interactions.corp.adjustment.detail', {
        amount: formatIskCompact(a.amount),
        reason: a.reason,
      }),
      to,
    });
  }

  return out.filter((i) => Number.isFinite(i.at));
}
