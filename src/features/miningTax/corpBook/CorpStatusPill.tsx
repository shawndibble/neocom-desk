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

const PILL_TONE: Record<PillState, string> = {
  pending: 'text-text-dim',
  billed: 'text-danger bg-danger/10',
  estimate: 'text-danger bg-danger/10',
  conflict: 'text-warning bg-warning/10',
  unattributed: 'text-text-dim',
  dismissed: 'text-text-dim',
  waived: 'text-text-dim',
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
