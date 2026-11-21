/**
 * "I already paid" with a payment to somebody else (resolving in the app, mockup "Which payment
 * was it?"): the member's own outgoing wallet-journal payments around the billed period, each
 * labelled by who received it. The chosen ones become the declaration's transfers; the rest of
 * the member's wallet never leaves the device.
 */
import { utcDayOf } from '../../../../../functions/src/timeConstants';
import type { ClaimedTransfer, TransferRecipient } from '@/engine/corpTaxBook/overdue';
import { inFlightDonations, type HeldPayment } from '@/engine/corpTaxBook/personal';
import type { MadePayment } from '../../paymentLinks';

/** What the ids a payment went to are: the app's name lookup says character or corporation. */
export type RecipientCategory = 'character' | 'corporation' | 'alliance' | (string & {});

export interface TransferChoice {
  payment: MadePayment;
  recipient: TransferRecipient;
  /** Who received it, when the journal names them. */
  recipientName?: string;
  /** The transfer the declaration carries when this one is chosen. */
  transfer: ClaimedTransfer;
}

/** The most payments the picker lists: the newest, so an old payment never crowds a recent one. */
export const MAX_CHOICES = 20;

/** Who a payment went to, from the book's own corporation and what the recipient's id is. */
export function recipientOf(
  counterpartyId: number | undefined,
  bookCorporationId: number,
  category: RecipientCategory | undefined
): TransferRecipient {
  if (counterpartyId === bookCorporationId) return 'corporation';
  return category === 'corporation' || category === 'alliance' ? 'otherCorporation' : 'character';
}

/**
 * The member's payments a claim may name: never one a link holds (it pays a personal Payee), and
 * never a donation the book already holds (it is credited, or counted for review). Which donation
 * the book holds is the shared one-to-one rule the account counts in-flight donations by.
 */
export function claimablePayments(
  payments: readonly MadePayment[],
  opts: {
    bookCorporationId: number;
    /** `paymentLinkKey`s a link holds. */
    linked: ReadonlySet<string>;
    /** The book's payments (`LoadedCorpBook.payments`). */
    held: readonly HeldPayment[];
  }
): MadePayment[] {
  const toBook = payments.filter((p) => p.counterpartyId === opts.bookCorporationId);
  const inFlight = new Set(
    inFlightDonations(toBook, opts.held, opts.bookCorporationId, '').map((d) => d.refId)
  );
  return payments.filter(
    (p) =>
      !opts.linked.has(p.key) &&
      !(
        p.counterpartyId === opts.bookCorporationId &&
        p.method === 'donation' &&
        !inFlight.has(p.refId)
      )
  );
}

/**
 * The member's outgoing journal payments from `since` on (the billed period's first day),
 * newest first, each as the transfer it would claim. Contracts carry no ISK figure and are left
 * out; so is a payment with no journal id to search on.
 */
export function transferChoices(
  payments: readonly MadePayment[],
  opts: {
    bookCorporationId: number;
    since: string;
    categories: ReadonlyMap<number, RecipientCategory>;
  }
): TransferChoice[] {
  return payments
    .filter(
      (p) =>
        p.kind === 'journal' &&
        p.amount !== null &&
        p.amount > 0 &&
        utcDayOf(p.date) >= utcDayOf(opts.since)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_CHOICES)
    .map((payment) => {
      const recipient = recipientOf(
        payment.counterpartyId,
        opts.bookCorporationId,
        payment.counterpartyId === undefined
          ? undefined
          : opts.categories.get(payment.counterpartyId)
      );
      return {
        payment,
        recipient,
        ...(payment.counterpartyName !== undefined
          ? { recipientName: payment.counterpartyName }
          : {}),
        transfer: {
          amount: payment.amount ?? 0,
          at: payment.date,
          journalRef: payment.refId,
          recipient,
          ...(recipient === 'corporation' || payment.counterpartyId === undefined
            ? {}
            : { recipientId: payment.counterpartyId }),
        },
      };
    });
}
