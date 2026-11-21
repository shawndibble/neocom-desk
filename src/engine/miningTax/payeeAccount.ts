/**
 * A personal Payee's Running account (decision 20261120-235011, "one way to pay" and "linking
 * money"). Every Payee is paid oldest first, the way a Corp Tax Book is: the pilot's billed
 * Assignments (after dismiss, tax % and splits) are its days, and each Made Payment linked to the
 * Payee pays its oldest unpaid day; what is over is credit. It is the book's own
 * `MinerRunningAccount`, so the two can never settle money differently.
 *
 * Its closed-through checkpoint lives on the pilot's device, on the same rule as a book's
 * (`closedThroughFor`), and the account is built from it and the days after it only. Everything
 * a personal account is built from is the pilot's own and can still change after the month
 * closes (a payment from back then linked today), so every write dated on or before a stored
 * checkpoint drops it (the server's rule), and the next load recomputes from the whole history.
 *
 * Pure: the caller loads the Assignments, the links and the stored checkpoint.
 */
import { utcDayOf } from '../../../functions/src/timeConstants';
import {
  closedThroughFor,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import {
  MinerRunningAccount,
  type MinerRunningAccountInput,
  type RunningAccountOwes,
} from '../corpTaxBook/minerRunningAccount';
import { previewPayment, type PaymentOutcome } from '../corpTaxBook/paymentPreview';
import type { TaxPayment } from '../corpTaxBook/payments';
import type { LedgerCharge, LedgerPayment, PayeeLedgerSource } from './payeeLedger';

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
  /** A legacy link's old payment's transactions: held, so never linked or matched again. */
  refs?: readonly PayeePaymentRef[];
  /**
   * A legacy link the pilot unlinked: kept, paying nothing, so reading the old marks again finds
   * it and never brings it back (a deleted record leaves no lasting trace on other devices).
   */
  unlinked?: true;
}

/** One Made Payment's identity: a journal id and a contract id are separate id spaces. */
export function paymentLinkKey(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): string {
  return `${link.kind}:${link.refId}`;
}

/** Whether a link pays its Payee: every link but a legacy one the pilot unlinked. */
export const pays = (link: Pick<PayeePaymentLink, 'unlinked'>): boolean => link.unlinked !== true;

/**
 * The Made Payments links hold (`paymentLinkKey`): each paying link's own, and the transactions
 * a legacy link's old payment named. A held payment is never linked, suggested or matched again.
 */
export function heldPaymentKeys(links: readonly PayeePaymentLink[]): Set<string> {
  const out = new Set<string>();
  for (const l of links) {
    if (!pays(l)) continue;
    out.add(paymentLinkKey(l));
    for (const ref of l.refs ?? []) out.add(paymentLinkKey(ref));
  }
  return out;
}

/** One billed Assignment, as its Payee's account bills it. */
export interface PayeeCharge {
  id: string;
  /** The EVE/UTC day it was mined. */
  date: string;
  /** What it bills this Payee: its tax, less any share a Corp Tax Book bills too. */
  tax: number;
}

/** A checkpoint as the device keeps it, until a write dated on or before it drops it. */
export interface StoredPayeeCheckpoint {
  checkpoint: RunningAccountCheckpoint;
  /**
   * How much it closed: what a write that bypasses the app's own write paths (a backup import, a
   * Character removed, a hand-edited store) would change. Two sums, no account work: a checkpoint
   * whose closed history no longer adds up is not used.
   */
  closed?: ClosedSummary;
}

/** The charges and payments dated on or before a checkpoint, counted and summed. */
export interface ClosedSummary {
  charges: number;
  tax: number;
  payments: number;
  paid: number;
}

function closedSummary(input: MinerRunningAccountInput, through: string): ClosedSummary {
  const out: ClosedSummary = { charges: 0, tax: 0, payments: 0, paid: 0 };
  for (const d of input.days)
    if (d.date <= through) {
      out.charges += 1;
      out.tax += d.tax;
    }
  for (const p of input.payments)
    if (utcDayOf(p.at) <= through) {
      out.payments += 1;
      out.paid += p.amount;
    }
  return out;
}

const sameSummary = (a: ClosedSummary, b: ClosedSummary) =>
  a.charges === b.charges &&
  a.payments === b.payments &&
  Math.abs(a.tax - b.tax) < 0.005 &&
  Math.abs(a.paid - b.paid) < 0.005;

export interface PayeeAccountInput {
  /** The Payee: a merged Payee's primary id. */
  payeeId: string;
  charges: readonly PayeeCharge[];
  links: readonly PayeePaymentLink[];
  /** The device's stored checkpoint: the account starts from it. */
  stored?: StoredPayeeCheckpoint;
}

/** The instant a link's money arrived, for the account's oldest-first order. */
const linkAt = (link: Pick<PayeePaymentLink, 'paidOn'>) => `${link.paidOn}T00:00:00.000Z`;

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
export class PayeeAccount {
  private constructor(
    readonly payeeId: string,
    readonly charges: readonly PayeeCharge[],
    readonly links: readonly PayeePaymentLink[],
    /** The Running account itself. */
    readonly account: MinerRunningAccount,
    /** Everything the account bills and is paid, the closed past included. */
    private readonly whole: MinerRunningAccountInput
  ) {}

  static build(input: PayeeAccountInput): PayeeAccount {
    const links = input.links.filter(pays);
    const whole: MinerRunningAccountInput = {
      days: input.charges.map((c) => ({ date: c.date, tax: c.tax })),
      payments: links.map((l) => taxPaymentOf(input.payeeId, l)),
    };
    const stored = input.stored;
    // Trusted while what it closed still adds up; a write through the app drops it outright.
    const cp =
      stored?.closed !== undefined &&
      sameSummary(stored.closed, closedSummary(whole, stored.checkpoint.through))
        ? stored.checkpoint
        : undefined;
    const account = MinerRunningAccount.build({
      ...whole,
      ...(cp ? { checkpoint: cp } : {}),
    });
    return new PayeeAccount(input.payeeId, input.charges, links, account, whole);
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

  /** The checkpoint the account starts from, when the device has one. */
  get startsFrom(): RunningAccountCheckpoint | undefined {
    return this.account.input.checkpoint;
  }

  /** Whether a day is paid: settled on the account, or closed in its checkpoint with nothing owed. */
  isPaid(date: string): boolean {
    const day = this.account.day(date);
    if (day) return day.settled;
    const cp = this.startsFrom;
    return cp !== undefined && date <= cp.through && !cp.owed.some((d) => d.date === date);
  }

  /** What is still owed of one charge: its share of what is left of its date. */
  owedOf(charge: Pick<PayeeCharge, 'date' | 'tax'>): number {
    if (this.account.day(charge.date)) return this.account.owedOf(charge.date, charge.tax);
    const owed = this.startsFrom?.owed.find((d) => d.date === charge.date);
    if (!owed) return 0;
    const dayTax = this.charges
      .filter((c) => c.date === charge.date)
      .reduce((sum, c) => sum + c.tax, 0);
    return dayTax > 0 ? (owed.remaining * charge.tax) / dayTax : 0;
  }

  /** The linked payments whose money reached a day, with what each put on it, oldest first. */
  paidBy(date: string): { key: string; amount: number }[] {
    return this.account.applications.payments.flatMap((p) => {
      const amount = p.days.filter((d) => d.date === date).reduce((sum, d) => sum + d.amount, 0);
      return amount > 0 ? [{ key: p.paymentId, amount }] : [];
    });
  }

  /**
   * What one more payment of `amount` on `paidOn` (a UTC day) would do, before it is recorded. A
   * payment dated on or before the checkpoint previews on the whole history: recording it drops
   * the checkpoint, so that is what it will pay.
   */
  preview(amount: number, paidOn: string): PaymentOutcome {
    const cp = this.startsFrom;
    return previewPayment(
      cp !== undefined && paidOn <= cp.through ? this.whole : this.account.input,
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

  /**
   * The checkpoint to store on `today`: through `closedThroughFor(today)`, built on the one it
   * starts from. Undefined when the account already starts from that date, or nothing is billed
   * or paid on or before it yet.
   */
  nextCheckpoint(today: string, at: string): StoredPayeeCheckpoint | undefined {
    const through = closedThroughFor(today);
    if (this.startsFrom && this.startsFrom.through >= through) return undefined;
    const before = (date: string) => date <= through;
    const anything =
      this.whole.days.some((d) => before(d.date)) ||
      this.whole.payments.some((p) => before(utcDayOf(p.at)));
    if (!anything) return undefined;
    return {
      checkpoint: MinerRunningAccount.checkpoint(this.account.input, this.payeeId, through, { at }),
      closed: closedSummary(this.whole, through),
    };
  }

  /** The Payee ledger's source: the account, each charge and payment described by the caller. */
  ledgerSource(describe: {
    charge: (charge: PayeeCharge) => Omit<LedgerCharge, 'id' | 'date' | 'tax'>;
    payment: (link: PayeePaymentLink) => Omit<LedgerPayment, 'id'>;
  }): PayeeLedgerSource {
    const cp = this.startsFrom;
    return {
      account: this.account,
      charges: this.charges.map((c) => ({
        ...describe.charge(c),
        id: c.id,
        date: c.date,
        tax: c.tax,
      })),
      payments: this.links.map((l) => ({ ...describe.payment(l), id: paymentLinkKey(l) })),
      ...(cp ? { opening: { through: cp.through, balance: cp.balance } } : {}),
    };
  }
}
