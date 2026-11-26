import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import type { BookCorrection } from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';

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
