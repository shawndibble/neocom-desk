/**
 * A personal Payee's Running account (decision 20261120-235011, "one way to pay" and "linking
 * money"). Every Payee is paid oldest first, the way a Corp Tax Book is: the pilot's billed
 * Assignments (after dismiss, tax % and splits) are its days, and each Made Payment linked to the
 * Payee pays its oldest unpaid day; what is over is credit. It is the book's own
 * `MinerRunningAccount`, so the two can never settle money differently.
 *
 * Its closed-through checkpoint lives on the pilot's device, on the same rule as a book's
 * (`closedThroughFor`). Everything a personal account is built from is the pilot's own and can
 * still change after the month closes (a payment from back then linked today), so a stored
 * checkpoint carries a fingerprint of what it summed and is only used while that still holds.
 *
 * Pure: the caller loads the Assignments, the links and the stored checkpoint.
 */
import {
  closedThroughFor,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import { paymentCode } from '../../../functions/src/corpTaxBookLateNotice';
import {
  MinerRunningAccount,
  type MinerRunningAccountInput,
  type RunningAccountOwes,
} from '../corpTaxBook/minerRunningAccount';
import { previewPayment, type PaymentOutcome } from '../corpTaxBook/paymentPreview';
import type { TaxPayment } from '../corpTaxBook/payments';
import type { LedgerCharge, LedgerPayment, PayeeLedgerSource } from './payeeLedger';

/**
 * Where a linked payment came from: a wallet journal entry, a contract paid in kind, or a
 * payment the pilot recorded in Settle up before (or without) its transaction showing up.
 */
export type PayeePaymentKind = 'journal' | 'contract' | 'recorded';

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
}

/** One Made Payment's identity: a journal id and a contract id are separate id spaces. */
export function paymentLinkKey(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): string {
  return `${link.kind}:${link.refId}`;
}

/** One billed Assignment, as its Payee's account bills it. */
export interface PayeeCharge {
  id: string;
  /** The EVE/UTC day it was mined. */
  date: string;
  /** What it bills this Payee: its tax, less any share a Corp Tax Book bills too. */
  tax: number;
}

/** A checkpoint as the device keeps it: with a fingerprint of everything it summed. */
export interface StoredPayeeCheckpoint {
  checkpoint: RunningAccountCheckpoint;
  fingerprint: string;
}

export interface PayeeAccountInput {
  /** The Payee: a merged Payee's primary id. */
  payeeId: string;
  charges: readonly PayeeCharge[];
  links: readonly PayeePaymentLink[];
  /** The device's stored checkpoint; ignored once what it summed has changed. */
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

/** What every day and payment on or before `through` sums to, so a change to any shows. */
function fingerprintOf(input: MinerRunningAccountInput, through: string): string {
  const days = input.days
    .filter((d) => d.date <= through)
    .map((d) => `${d.date}=${Math.round(d.tax * 100)}`)
    .sort();
  const payments = input.payments
    .filter((p) => p.at.slice(0, 10) <= through)
    .map((p) => `${p.id}@${p.at}=${Math.round(p.amount * 100)}`)
    .sort();
  return paymentCode([...days, '|', ...payments].join(','));
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
    /** Everything the account bills and is paid, before any checkpoint: what a checkpoint sums. */
    private readonly whole: MinerRunningAccountInput
  ) {}

  static build(input: PayeeAccountInput): PayeeAccount {
    const whole: MinerRunningAccountInput = {
      days: input.charges.map((c) => ({ date: c.date, tax: c.tax })),
      payments: input.links.map((l) => taxPaymentOf(input.payeeId, l)),
    };
    const stored = input.stored;
    const usable =
      stored !== undefined &&
      stored.fingerprint === fingerprintOf(whole, stored.checkpoint.through);
    const account = MinerRunningAccount.build({
      ...whole,
      ...(usable ? { checkpoint: stored.checkpoint } : {}),
    });
    return new PayeeAccount(input.payeeId, input.charges, input.links, account, whole);
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

  /** The checkpoint the account starts from, when the stored one still holds. */
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

  /** What one more payment of `amount` on `paidOn` would do, before it is recorded. */
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

  /**
   * The checkpoint to store on `today`: through `closedThroughFor(today)`, from the whole
   * history. Undefined when the account already starts from that date, or nothing is billed or
   * paid on or before it yet.
   */
  nextCheckpoint(today: string, at: string): StoredPayeeCheckpoint | undefined {
    const through = closedThroughFor(today);
    if (this.startsFrom && this.startsFrom.through >= through) return undefined;
    const before = (date: string) => date <= through;
    const anything =
      this.whole.days.some((d) => before(d.date)) ||
      this.whole.payments.some((p) => before(p.at.slice(0, 10)));
    if (!anything) return undefined;
    return {
      checkpoint: MinerRunningAccount.checkpoint(this.whole, this.payeeId, through, { at }),
      fingerprint: fingerprintOf(this.whole, through),
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
