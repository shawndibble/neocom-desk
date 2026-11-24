import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { figureOpenerClassName } from '@/components/ui/controlStyles';

/**
 * The Refine (and Turn in) chip's value: the figure, dashed underlined when it opens its
 * breakdown, and the total efficiency it was worked out at beside it (so a
 * default is never silent). A `StatChip` can't be pressed (§6c), so the
 * control sits inside its value.
 */
export function RefineChipValue({
  amount,
  basis,
  efficiency,
  onOpen,
  openLabel,
}: {
  amount: ReactNode;
  /** The price basis the figure is on, already translated ("buy"); omitted where there is only one. */
  basis?: string;
  /** "68.3%", or a span; null when nothing carries one. */
  efficiency: string | null;
  onOpen?: () => void;
  /** The opener's accessible name; the refine breakdown's by default. */
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
