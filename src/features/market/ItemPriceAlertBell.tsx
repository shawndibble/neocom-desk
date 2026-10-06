/**
 * The Market Browser item header's price alert bell (issue #1427): opens the
 * shared alert form in a popover, and one Save pins the item and sets its
 * target. `md` (44px on touch) like the adjacent header buttons.
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
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        {/*
          `Tooltip` (via `tooltip=`), not a native `title=`: a touch device has
          no hover, so the disabled reason was unreachable on a phone (#2162).
          `aria-disabled` rather than the native attribute, same reasoning as
          `Characters.tsx`'s refresh-all button — a natively disabled button
          takes no hover, focus, or tap, so the bubble it would carry is
          unreachable by any route. Unlike that button, the tap here does
          nothing while disabled (the Popover's own `onOpenChange` guard above
          keeps it inert), so `openOnTap` reveals the bubble on a plain tap
          rather than the touch-and-hold a still-live tap would need to keep.
        */}
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
