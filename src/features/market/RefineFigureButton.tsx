import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { figureOpenerClassName } from '@/components/ui/controlStyles';

/**
 * A row's Refine figure as the control that opens its breakdown: the figure
 * itself, dashed underlined. The press never reaches the row beneath.
 */
export function RefineFigureButton({
  name,
  onOpen,
  children,
}: {
  name: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={figureOpenerClassName}
    >
      <span className="sr-only">{t('market.appraisal.breakdown.openRow', { name })}</span>
      {children}
    </button>
  );
}
