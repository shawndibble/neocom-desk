import { utcDayOf } from '../../../../../functions/src/timeConstants';
import type { ClaimedTransfer, TransferRecipient } from '@/engine/corpTaxBook/overdue';
import { inFlightDonations, type HeldPayment } from '@/engine/corpTaxBook/personal';
import type { MadePayment } from '../../paymentLinks';

export type RecipientCategory = 'character' | 'corporation' | 'alliance' | (string & {});

export interface TransferChoice {
  payment: MadePayment;
  recipient: TransferRecipient;
  recipientName?: string;
  transfer: ClaimedTransfer;
}

export const MAX_CHOICES = 20;

export function recipientOf(
  counterpartyId: number | undefined,
  bookCorporationId: number,
  category: RecipientCategory | undefined
): TransferRecipient {
  if (counterpartyId === bookCorporationId) return 'corporation';
  return category === 'corporation' || category === 'alliance' ? 'otherCorporation' : 'character';
}

export function claimablePayments(
  payments: readonly MadePayment[],
  opts: {
    bookCorporationId: number;
    linked: ReadonlySet<string>;
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
