import type { StatChipTone } from '@/components/ui';
import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';

export const STATUS_TONE: Record<MiningTaxRowStatus, StatChipTone> = {
  unassigned: 'default',
  outstanding: 'danger',
  tracked: 'default',
  'needs-review': 'warning',
  paid: 'success',
  dismissed: 'default',
};

export const STATUS_TEXT_CLASS: Record<MiningTaxRowStatus, string> = {
  unassigned: 'text-text-dim',
  outstanding: 'text-danger',
  tracked: 'text-text-dim',
  'needs-review': 'text-warning',
  paid: 'text-success',
  dismissed: 'text-text-dim',
};
