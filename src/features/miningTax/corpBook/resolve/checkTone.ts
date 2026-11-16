import type { PillTone } from '@/components/ui/Pill';
import type { ClaimCheckResult } from '@/engine/corpTaxBook/overdue';

/** What checking a transfer against the book found, as a pill. */
export const CHECK_TONE: Record<ClaimCheckResult, PillTone> = {
  found: 'success',
  division: 'warning',
  notSynced: 'neutral',
  tooOld: 'neutral',
  notFound: 'danger',
  person: 'accent',
  otherCorp: 'warning',
  ambiguous: 'warning',
};
