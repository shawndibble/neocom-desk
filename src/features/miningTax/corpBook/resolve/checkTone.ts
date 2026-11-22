import type { PillTone } from '@/components/ui/Pill';
import type { ClaimCheckResult } from '@/engine/corpTaxBook/overdue';

/** What checking a claimed transfer against the book found, as a pill's tone. */
export const CHECK_TONE: Record<ClaimCheckResult, PillTone> = {
  found: 'success',
  credited: 'success',
  division: 'warning',
  notSynced: 'neutral',
  tooOld: 'neutral',
  notFound: 'danger',
  person: 'accent',
  otherCorp: 'warning',
  ambiguous: 'warning',
};
