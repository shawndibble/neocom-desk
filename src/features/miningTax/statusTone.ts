/**
 * Shared tone conventions for a row's status (issue #523), so the table's
 * Status column and `RowDetailModal`'s status chip read the same signal:
 * `danger` for money still owed, `success` once paid, `warning` for a state
 * needing a decision, dim/`default` for anything settled or not yet decided.
 */
import type { StatChipTone } from '@/components/ui';
import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';

export const STATUS_TONE: Record<MiningTaxRowStatus, StatChipTone> = {
  unassigned: 'default',
  outstanding: 'danger',
  'needs-review': 'warning',
  paid: 'success',
  dismissed: 'default',
};

/** Same semantics as `STATUS_TONE`, as text-color classes — the table's Status
 * column colors its label directly rather than nesting a second `StatChip`
 * inside an already-dense row. */
export const STATUS_TEXT_CLASS: Record<MiningTaxRowStatus, string> = {
  unassigned: 'text-text-dim',
  outstanding: 'text-danger',
  'needs-review': 'text-warning',
  paid: 'text-success',
  dismissed: 'text-text-dim',
};
