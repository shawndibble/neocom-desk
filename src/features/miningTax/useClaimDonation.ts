import { useState } from 'react';
import { claimCorpTaxBookPayment } from '@/features/miningTax/corpBook/corpBookStore';

/** A player claims their own Unmatched donation: audited and uid-authorised server side. */
export function useClaimDonation(reloadCorpBooks: () => void) {
  // The claim of an Unmatched donation.
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function handleClaim(
    characterId: number,
    corporationId: number,
    paymentId: string,
    claimKey: string
  ) {
    setClaiming(claimKey);
    setClaimError(null);
    try {
      await claimCorpTaxBookPayment(characterId, corporationId, paymentId);
      reloadCorpBooks();
    } catch {
      setClaimError(claimKey);
    } finally {
      setClaiming(null);
    }
  }

  return { claiming, claimError, handleClaim };
}
