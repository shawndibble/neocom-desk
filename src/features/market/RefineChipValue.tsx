import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { figureOpenerClassName } from '@/components/ui/controlStyles';

export function RefineChipValue({
  amount,
  basis,
  efficiency,
  onOpen,
  openLabel,
}: {
  amount: ReactNode;
  basis?: string;
  efficiency: string | null;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      {onOpen ? (
        <button type="button" onClick={onOpen} className={figureOpenerClassName}>
          <span className="sr-only">{openLabel ?? t('market.appraisal.breakdown.open')}</span>
          {amount}
        </button>
      ) : (
        amount
      )}
      {(basis || efficiency) && (
        <span className="font-normal text-text-dim">
          {[basis, efficiency && t('market.appraisal.breakdown.atEfficiency', { efficiency })]
            .filter(Boolean)
            .join(' ')}
        </span>
      )}
    </span>
  );
}
