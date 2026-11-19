import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';

/**
 * Where a payment sits in the corp wallet: the division and journal entry its id names
 * (`j{division}_{refId}`, `donationsFromJournal`). A payment an officer recorded by hand has no
 * journal entry, so no link.
 */
export function paymentWalletHref(paymentId: string): string | null {
  const m = /^j(\d+)_(\d+)$/.exec(paymentId);
  return m ? `/corp/wallet?division=${m[1]}&${HIGHLIGHT_PARAM}=${m[2]}` : null;
}
