import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { cx } from '@/lib/cx';
import { STATUS_TEXT_CLASS } from './statusTone';

/** A status as a small tinted word — readable without its colour, and still one word on a dense phone card. */
export function StatusPill({ status, label }: { status: MiningTaxRowStatus; label: string }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
        STATUS_TEXT_CLASS[status],
        STATUS_PILL_TINT[status]
      )}
    >
      {label}
    </span>
  );
}

const STATUS_PILL_TINT: Record<MiningTaxRowStatus, string> = {
  unassigned: '',
  'needs-review': 'bg-warning/10',
  outstanding: 'bg-danger/10',
  paid: '',
  dismissed: '',
};
