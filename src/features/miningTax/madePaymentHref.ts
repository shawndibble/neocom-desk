import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';

export function madePaymentHref(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): string | null {
  if (link.kind === 'journal') return `/wallet/journal?${HIGHLIGHT_PARAM}=${link.refId}`;
  if (link.kind === 'contract') return `/contracts?${HIGHLIGHT_PARAM}=${link.refId}`;
  return null;
}
