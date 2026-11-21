import type { PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';

/**
 * Where a Made Payment sits: its wallet journal entry or its contract. A recorded payment, or a
 * legacy link, is no transaction of the pilot's, so no link.
 */
export function madePaymentHref(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): string | null {
  if (link.kind === 'journal') return `/wallet/journal?${HIGHLIGHT_PARAM}=${link.refId}`;
  if (link.kind === 'contract') return `/contracts?${HIGHLIGHT_PARAM}=${link.refId}`;
  return null;
}
