import type { PillTone } from '@/components/ui/Pill';
import type { ClaimCheckResult } from '@/engine/corpTaxBook/overdue';

/**
 * What checking a claimed transfer against the book found, as a pill's tone. `ambiguous`: more
 * than one wallet entry fits, so an officer chooses (the check result the server adds); listed
 * here so the tone is ready the moment the type carries it.
 */
export const CHECK_TONE: Record<ClaimCheckResult | 'ambiguous', PillTone> = {
  found: 'success',
  division: 'warning',
  notSynced: 'neutral',
  tooOld: 'neutral',
  notFound: 'danger',
  person: 'accent',
  otherCorp: 'warning',
  ambiguous: 'warning',
};
