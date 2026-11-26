import type { PillTone } from '@/components/ui/Pill';
import type { ClaimCheckResult } from '@/engine/corpTaxBook/overdue';

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
