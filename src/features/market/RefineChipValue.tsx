import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';

/**
 * The Refine chip's value: the figure, the total efficiency it was worked out
 * at (so a default is never silent), and the ⓘ that opens its breakdown. A
 * `StatChip` can't be pressed (§6c), so the control sits inside its value.
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
      {amount}
      {efficiency && <span className="font-normal text-text-dim">@ {efficiency}</span>}
      {onOpen && (
        <IconButton
          icon={<Icon.Info aria-hidden="true" size={Icon.ICON_SIZE.sm} />}
          label={t('market.appraisal.breakdown.open')}
          variant="plain"
          size="sm"
          onClick={onOpen}
        />
      )}
    </span>
  );
}
