import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { cx } from '@/lib/cx';
import { STATUS_TEXT_CLASS } from './statusTone';

/** A status as a small bordered pill — readable without its colour, and still one word on a dense phone card. */
export function StatusPill({ status, label }: { status: MiningTaxRowStatus; label: string }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-xs border px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
        STATUS_TEXT_CLASS[status],
        STATUS_PILL_BORDER[status]
      )}
    >
      {label}
    </span>
  );
}

const STATUS_PILL_BORDER: Record<MiningTaxRowStatus, string> = {
  unassigned: 'border-line-bright',
  'needs-review': 'border-warning/50 bg-warning/10',
  outstanding: 'border-danger/50 bg-danger/10',
  paid: 'border-success/40',
  dismissed: 'border-line',
};
