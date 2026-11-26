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
  item: QuickbarItem | undefined;
  disabled: boolean;
  onPin: (typeId: number, name: string, target: QuickbarTarget) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <IconButton
          size="md"
          icon={<Icon.PriceAlert />}
          label={t('market.priceAlert.button', { name })}
          tooltip={disabled ? t('market.contextMenu.quickbarNoCharacter') : undefined}
          pressed={item !== undefined && hasQuickbarTarget(item)}
          aria-disabled={disabled || undefined}
          openOnTap={disabled}
          className="aria-disabled:cursor-default aria-disabled:opacity-40"
        />
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t('market.priceAlert.button', { name })}>
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
