import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import { StatusPill } from '../StatusPill';
import type { CorpRowInfo } from './corpRows';
import {
  useCorpPillText,
  useCorpStateHint,
  useCorpStateLabel,
  type PillState,
} from './useCorpStateText';

/** The tab's own pill look, with the Corp Tax Book values added (mockup F16). */
const PILL_TONE: Record<PillState, string> = {
  pending: 'text-text-dim',
  billed: 'text-danger bg-danger/10',
  'sent-waiting': 'text-warning bg-warning/10',
  conflict: 'text-warning bg-warning/10',
  unattributed: 'text-text-dim',
  dismissed: 'text-text-dim',
  waived: 'text-text-dim',
};

export function CorpStatusPill({ corp }: { corp: CorpRowInfo }) {
  const label = useCorpStateLabel();
  const pillText = useCorpPillText();
  const hint = useCorpStateHint();
  if (corp.kind === 'row' && corp.view.state === 'paid') {
    return <StatusPill status="paid" label={label(corp)} hint={hint(corp)} />;
  }
  const state = (corp.kind === 'label' ? corp.state : corp.view.state) as PillState;
  return (
    <HintText content={hint(corp)}>
      <span
        className={cx(
          'inline-flex rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
          PILL_TONE[state]
        )}
      >
        {pillText(corp)}
      </span>
    </HintText>
  );
}
