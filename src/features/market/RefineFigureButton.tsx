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
      className={`inline-flex items-center gap-1 rounded-xs hover:text-accent ${focusRingInsetClassName}`}
    >
      <Icon.Info aria-hidden="true" size={Icon.ICON_SIZE.sm} className="text-text-dim" />
      <span className="sr-only">{t('market.appraisal.breakdown.openRow', { name })}</span>
      {children}
    </button>
  );
}
