import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '../StatusPill';
import { useNotPaying } from './resolve/notPaying';
import { keptBy, notPayingHides } from './resolve/targets';
import type { CorpRowInfo } from './corpRows';
import {
  flaggedPillState,
  useCorpStateHint,
  useCorpStateLabel,
  type PillState,
} from './useCorpStateText';

/** The tab's own pill look, with the Corp Tax Book values added (mockup F16). */
const PILL_TONE: Record<PillState, string> = {
  pending: 'text-text-dim',
  billed: 'text-danger bg-danger/10',
  estimate: 'text-danger bg-danger/10',
  conflict: 'text-warning bg-warning/10',
  // Waiting on the refinery log: nothing for the member to do.
  settling: 'text-text-dim',
  unattributed: 'text-text-dim',
  dismissed: 'text-text-dim',
  waived: 'text-text-dim',
  // Acted on: no longer a warning the member has to answer.
  sent: 'text-text-dim',
  oreWaived: 'text-text-dim',
  notPaying: 'text-text-dim',
};

export function CorpStatusPill({ corp }: { corp: CorpRowInfo }) {
  const { t } = useTranslation();
  const label = useCorpStateLabel();
  const hint = useCorpStateHint();
  const { hidden } = useNotPaying();
  if (corp.kind === 'row' && corp.view.state === 'paid') {
    return <StatusPill status="paid" label={label(corp)} hint={hint(corp)} />;
  }
  // The member's own "Not paying" (resolving in the app): never reads as settled, and the
  // tooltip says the book still bills it.
  // A day the member said no to, whatever kind of problem it was; an officer's later answer is
  // not hidden (its key names the answer), so the row shows it again with the next step.
  const notPaying = corp.kind === 'row' && notPayingHides(hidden, corp.view);
  const said = corp.kind === 'row' && keptBy(corp.view) ? corp.view : undefined;
  const nextStep =
    said?.flagged?.state === 'rejected' ? said.flagged.nextStep : said?.declaration?.nextStep;
  const flagged = corp.kind === 'row' ? flaggedPillState(corp.view) : undefined;
  const state = (
    notPaying ? 'notPaying' : (flagged ?? (corp.kind === 'label' ? corp.state : corp.view.state))
  ) as PillState;
  const pill = (
    <HintText
      content={
        notPaying
          ? t('miningTax.corpBook.hint.notPaying', { corp: corp.corpName })
          : nextStep
            ? `${hint(corp)} ${t('miningTax.resolve.facts.nextStep', { step: nextStep })}`
            : hint(corp)
      }
    >
      <span
        className={cx(
          'inline-flex rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
          PILL_TONE[state]
        )}
      >
        {notPaying ? t('miningTax.corpBook.state.notPaying') : label(corp)}
      </span>
    </HintText>
  );
  // Never reads as settled: the row says, in words and not only in a tooltip, who still bills it.
  if (!notPaying) return pill;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {pill}
      <span className="text-xs text-text-dim">
        {t('miningTax.corpBook.state.notPayingStill', { corp: corp.corpName })}
      </span>
    </span>
  );
}
