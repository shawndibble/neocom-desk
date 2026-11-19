import { parsePaymentId } from '@/engine/corpTaxBook/payouts';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';

/**
 * Where a payment sits in the corp wallet: the division and journal entry its id names. A payment
 * an officer recorded by hand has no journal entry, so no link.
 */
export function paymentWalletHref(paymentId: string): string | null {
  const ref = parsePaymentId(paymentId);
  return ref ? `/corp/wallet?division=${ref.division}&${HIGHLIGHT_PARAM}=${ref.refId}` : null;
}
