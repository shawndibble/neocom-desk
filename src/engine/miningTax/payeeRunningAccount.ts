/**
 * A personal Payee's Running account (decision 20261120-235011, "one way to pay" and "linking
 * money"). Every Payee is paid oldest first, the way a Corp Tax Book is: the pilot's billed
 * Assignments (after dismiss, tax % and splits) are its days, and each Made Payment linked to the
 * Payee pays its oldest unpaid day; what is over is credit. It is the book's own
 * `MinerRunningAccount`, so the two can never settle money differently.
 *
 * It is always built from the Payee's whole history: years of one Payee's days take a couple of
 * milliseconds, so a personal account keeps no snapshot.
 *
 * Pure: the caller loads the Assignments and the links.
 */
import { MinerRunningAccount, type RunningAccountOwes } from '../corpTaxBook/minerRunningAccount';
import { previewPayment, type PaymentOutcome } from '../corpTaxBook/paymentPreview';
import type { TaxPayment } from '../corpTaxBook/payments';

/**
 * Where a linked payment came from: a wallet journal entry, a contract paid in kind, a payment
 * the pilot recorded in Settle up before (or without) its transaction showing up, or a payment
 * an older client recorded as paid marks (`legacy`, read once from them: `legacyPaidMarks.ts`).
 */
export type PayeePaymentKind = 'journal' | 'contract' | 'recorded' | 'legacy';

/** A wallet transaction a legacy link's old payment named: what it holds, never what it pays. */
export interface PayeePaymentRef {
  kind: 'journal' | 'contract';
  refId: number;
}

/**
 * A Made Payment linked to one Payee: it pays that Payee's oldest unpaid days, never chosen
 * entries. Stored plain, one per payment (`paymentLinkKey`), so a payment can pay one Payee only.
 */
export interface PayeePaymentLink {
  payeeId: string;
  kind: PayeePaymentKind;
  /** The wallet journal entry or contract id; a recorded payment's own id. */
  refId: number | string;
  /**
   * The ISK it pays: a journal entry's amount, the pilot's figure for a payment in kind, what a
   * recorded payment said.
   */
  amount: number;
  /** The day it was paid, `YYYY-MM-DD`. */
  paidOn: string;
  /** Linked by the one-to-one matcher, or by the pilot. */
  source: 'auto' | 'manual';
  /** A stored link's owner: the Character that paid (`MiningTaxPaymentLinkRecord.characterId`). */
  characterId?: number;
  /** A legacy link's old payment's transactions: held, so never linked or matched again. */
  refs?: readonly PayeePaymentRef[];
}

/** One Made Payment's identity: a journal id and a contract id are separate id spaces. */
export function paymentLinkKey(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): string {
  return `${link.kind}:${link.refId}`;
}

/**
 * The Made Payments links hold (`paymentLinkKey`): each link's own, and the transactions a legacy
 * link's old payment named. A held payment is never linked, suggested or matched again.
 */
export function heldPaymentKeys(links: readonly PayeePaymentLink[]): Set<string> {
  const out = new Set<string>();
  for (const l of links) {
    out.add(paymentLinkKey(l));
    for (const ref of l.refs ?? []) out.add(paymentLinkKey(ref));
  }
  return out;
}

/**
 * A bare "Mark paid" an older client left (`legacyPaymentLinks`): a legacy link whose id is
 * `mark:<assignmentId>`, with no payment behind it. It is the pilot's word that one Assignment's
 * day was paid, never money: it settles only that day, after the real money.
 */
export function isBareMark(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): boolean {
  return link.kind === 'legacy' && typeof link.refId === 'string' && link.refId.startsWith('mark:');
}

/** What one bare mark settled on the account: its own day, for what real money left of it. */
export interface PayeeMarkedDay {
  /** The mark's link key (`paymentLinkKey`). */
  id: string;
  /** The day it settled; null when its Assignment no longer bills this Payee. */
  date: string | null;
  /** What it settled: 0 when real money had paid the day already. */
  amount: number;
}

/** One billed Assignment, as its Payee's account bills it. */
export interface PayeeCharge {
  id: string;
  /** The EVE/UTC day it was mined. */
  date: string;
  /** What it bills this Payee: its tax, less any share a Corp Tax Book bills too. */
  tax: number;
}

export interface PayeeRunningAccountInput {
  /** The Payee: a merged Payee's primary id. */
  payeeId: string;
  charges: readonly PayeeCharge[];
  links: readonly PayeePaymentLink[];
}

/** The instant a link's money arrived, for the account's oldest-first order. */
export const linkAt = (link: Pick<PayeePaymentLink, 'paidOn'>) => `${link.paidOn}T00:00:00.000Z`;

function taxPaymentOf(payeeId: string, link: PayeePaymentLink): TaxPayment {
  // Recorded by the pilot, so the book's start-date rule for donations never drops it.
  return {
    id: paymentLinkKey(link),
    minerId: payeeId,
    characterId: 0,
    amount: link.amount,
    at: linkAt(link),
    source: 'manual',
  };
}

/**
 * A personal Payee's account: what the Tax tab, Settle up, the Payee ledger and a Default System
 * read for what the pilot owes that Payee and what is paid.
 */
export class PayeeRunningAccount {
  private constructor(
    readonly payeeId: string,
    readonly charges: readonly PayeeCharge[],
    readonly links: readonly PayeePaymentLink[],
    /** The Running account itself. */
    readonly account: MinerRunningAccount,
    /** What each bare mark settled (`isBareMark`), after the real money. */
    readonly marked: readonly PayeeMarkedDay[]
  ) {}

  /**
   * Real money first: every link but a bare mark pays the oldest unpaid day, as a book's does.
   * Then each bare mark settles its own Assignment's day, for no more than it said and than real
   * money left of that day. A mark never pays another day and never creates credit.
   */
  static build(input: PayeeRunningAccountInput): PayeeRunningAccount {
    const links = input.links;
    const days = input.charges.map((c) => ({ date: c.date, tax: c.tax }));
    const money = links.filter((l) => !isBareMark(l)).map((l) => taxPaymentOf(input.payeeId, l));
    const marks = links
      .filter(isBareMark)
      .sort((a, b) => paymentLinkKey(a).localeCompare(paymentLinkKey(b)));
    if (marks.length === 0)
      return new PayeeRunningAccount(
        input.payeeId,
        input.charges,
        links,
        MinerRunningAccount.build({ days, payments: money }),
        []
      );
    const byMoney = MinerRunningAccount.build({ days, payments: money });
    const left = new Map<string, number>();
    const marked: PayeeMarkedDay[] = [];
    const settles: { date: string; tax: number }[] = [];
    for (const mark of marks) {
      const charge = input.charges.find((c) => `mark:${c.id}` === mark.refId);
      const day = charge ? byMoney.day(charge.date) : undefined;
      if (!charge || !day) {
        marked.push({ id: paymentLinkKey(mark), date: null, amount: 0 });
        continue;
      }
      const open = left.get(charge.date) ?? (day.held ? 0 : day.remaining);
      const amount = Math.max(0, Math.min(mark.amount, charge.tax, open));
      left.set(charge.date, open - amount);
      marked.push({ id: paymentLinkKey(mark), date: charge.date, amount });
      if (amount > 0) settles.push({ date: charge.date, tax: -amount });
    }
    // The settled part comes off its day as a credit line on that date, so the money still pays
    // only what is left, and the account (and its previews) read the days as settled.
    const account =
      settles.length === 0
        ? byMoney
        : MinerRunningAccount.build({ days: [...days, ...settles], payments: money });
    return new PayeeRunningAccount(input.payeeId, input.charges, links, account, marked);
  }

  get paidThrough(): string | null {
    return this.account.paidThrough;
  }

  get owes(): RunningAccountOwes | null {
    return this.account.owes;
  }

  get credit(): number {
    return this.account.credit;
  }

  get balance(): number {
    return this.account.balance;
  }

  /** Whether a day is paid: settled on the account. */
  isPaid(date: string): boolean {
    return this.account.day(date)?.settled === true;
  }

  /** What is still owed of one charge: its share of what is left of its date. */
  owedOf(charge: Pick<PayeeCharge, 'date' | 'tax'>): number {
    return this.account.day(charge.date) ? this.account.owedOf(charge.date, charge.tax) : 0;
  }

  /** What one more payment of `amount` on `paidOn` (a UTC day) would do, before it is recorded. */
  preview(amount: number, paidOn: string): PaymentOutcome {
    return previewPayment(
      this.account.input,
      taxPaymentOf(this.payeeId, {
        payeeId: this.payeeId,
        kind: 'recorded',
        refId: '\u0000preview',
        amount,
        paidOn,
        source: 'manual',
      })
    );
  }
}
