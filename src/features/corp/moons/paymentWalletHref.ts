import { parsePaymentId } from '@/engine/corpTaxBook/payouts';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';

export function paymentWalletHref(paymentId: string): string | null {
  const ref = parsePaymentId(paymentId);
  return ref ? `/corp/wallet?division=${ref.division}&${HIGHLIGHT_PARAM}=${ref.refId}` : null;
}
