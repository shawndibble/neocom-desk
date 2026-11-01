import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { focusRingInsetClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';

/**
 * A row's Refine figure as the control that opens its breakdown: the figure a
 * plain button, a small dim ⓘ before it (left, so the right-aligned digits
 * stay in line down the column). The press never reaches the row beneath.
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
      className={`relative inline-flex items-center rounded-xs hover:text-accent ${focusRingInsetClassName}`}
    >
      {/* Drawn in the cell's own left padding, so the column is no wider than the figure. */}
      <Icon.Info
        aria-hidden="true"
        size={Icon.ICON_SIZE.sm}
        className="absolute top-1/2 right-full mr-0.5 -translate-y-1/2 text-text-dim"
      />
      <span className="sr-only">{t('market.appraisal.breakdown.openRow', { name })}</span>
      {children}
    </button>
  );
}
