import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import { STATUS_TEXT_CLASS } from './statusTone';

/** A status as a small tinted word — readable without its colour, and still one word on a dense phone card. */
export function StatusPill({
  status,
  label,
  hint,
}: {
  status: MiningTaxRowStatus;
  label: string;
  /** Why the row is in this state, for a status whose row looks different (§6c: a tooltip, never the only place it's said). */
  hint?: string;
}) {
  const pill = (
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
  return hint ? <HintText content={hint}>{pill}</HintText> : pill;
}

const STATUS_PILL_TINT: Record<MiningTaxRowStatus, string> = {
  unassigned: '',
  'needs-review': 'bg-warning/10',
  outstanding: 'bg-danger/10',
  paid: '',
  dismissed: '',
};
