/**
 * The Market Browser item header's price alert bell (issue #1427): opens the
 * shared alert form in a popover, and one Save pins the item and sets its
 * target. `md` so the touch target reaches the 44px floor.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { QuickbarItem } from '@/db';
import { PriceAlertForm } from './PriceAlertForm';
import { hasQuickbarTarget, type QuickbarTarget } from './quickbar';

export function ItemPriceAlertBell({
  typeId,
  name,
  item,
  disabled,
  onPin,
}: {
  typeId: number;
  name: string;
  /** The item's Quickbar entry, if pinned. */
  item: QuickbarItem | undefined;
  /** No active Character — nobody to save the Quickbar under. */
  disabled: boolean;
  onPin: (typeId: number, name: string, target: QuickbarTarget) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          size="md"
          icon={<Icon.PriceAlert />}
          label={t('market.priceAlert.button', { name })}
          pressed={item !== undefined && hasQuickbarTarget(item)}
          disabled={disabled}
          title={disabled ? t('market.contextMenu.quickbarNoCharacter') : undefined}
        />
      </PopoverTrigger>
      <PopoverContent align="end">
        <PriceAlertForm
          typeId={typeId}
          targetPrice={item?.targetPrice}
          targetDirection={item?.targetDirection}
          onSave={(target) => onPin(typeId, name, target)}
          onClear={() => onPin(typeId, name, null)}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
