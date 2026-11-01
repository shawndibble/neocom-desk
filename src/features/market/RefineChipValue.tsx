import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { figureOpenerClassName } from '@/components/ui/controlStyles';

/**
 * The Refine chip's value: the figure, dashed underlined when it opens its
 * breakdown, and the total efficiency it was worked out at beside it (so a
 * default is never silent). A `StatChip` can't be pressed (§6c), so the
 * control sits inside its value.
 */
export function RefineChipValue({
  amount,
  efficiency,
  onOpen,
}: {
  amount: ReactNode;
  /** "68.3%", or a span; null when nothing carries one. */
  efficiency: string | null;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      {onOpen ? (
        <button type="button" onClick={onOpen} className={figureOpenerClassName}>
          <span className="sr-only">{t('market.appraisal.breakdown.open')}</span>
          {amount}
        </button>
      ) : (
        amount
      )}
      {efficiency && (
        <span className="font-normal text-text-dim">
          {t('market.appraisal.breakdown.atEfficiency', { efficiency })}
        </span>
      )}
    </span>
  );
}
