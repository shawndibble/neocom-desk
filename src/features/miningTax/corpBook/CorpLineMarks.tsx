import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import type { BookCorrection } from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';

/**
 * The tax a corporation's line owes after it corrected the day (issue #4622, spec #4504): the
 * old figure stays on the line, struck through, so a correction is never silent. The tooltip
 * gives the corporation's reason; the line's detail repeats it.
 */
export function CorpCorrectedAmount({
  correction,
  children,
}: {
  correction: BookCorrection;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const before = `${formatIsk(correction.before)} ISK`;
  const note = t('miningTax.corpBook.line.corrected', { before });
  const reasons = correction.reasons.join(' · ');
  return (
    <HintText content={reasons ? `${note} ${reasons}` : note}>
      {/* Above the new figure from `sm` up, where the column is too narrow for both. */}
      <span
        className="mr-1.5 font-normal text-text-dim line-through sm:mr-0 sm:block sm:text-[0.6875rem]"
        aria-hidden="true"
      >
        {formatIsk(correction.before)}
      </span>
      <span className="sr-only">{note}</span>
      {children}
    </HintText>
  );
}

/**
 * The miner's own list also gives this line's ore to a Payee (issue #4517, #4622): the amber
 * warning mark on the line, so the clash shows without opening it. The line's detail holds
 * the notice and its two choices.
 */
export function CorpOverlapMark() {
  const { t } = useTranslation();
  const label = t('miningTax.corpBook.line.overlap');
  return (
    <HintText content={label} className="ml-1.5 inline-flex align-middle text-warning">
      <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </HintText>
  );
}
