import { Fragment, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';

/** One Optimize menu entry — a shared shape (label, hint, disabled, handler) instead of near-identical `DropdownMenuItem` blocks. */
export interface OptimizeMenuItem {
  key: string;
  label: string;
  hint: string;
  disabled: boolean;
  onSelect: () => void;
  emphasize?: boolean;
}

interface OptimizeMenuProps {
  /** In display order; the first is the default ("Optimize for me") and is set apart by a separator. */
  items: readonly OptimizeMenuItem[];
  disabled: boolean;
}

/**
 * One Optimize control replacing three stacked buttons: "Optimize for me"
 * leads as the default item, single modes stay below it.
 */
export function OptimizeMenu({ items, disabled }: OptimizeMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Ties each item's `aria-label` (the mode name) to its hint span via
  // `aria-describedby`, so the "why" still reaches screen readers.
  const hintId = useId();
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="md" align="start" className="w-full" disabled={disabled}>
          <span aria-hidden="true" className="shrink-0 text-text-dim">
            <Icon.OptimizeRemaps size={Icon.ICON_SIZE.sm} />
          </span>
          <span className="flex-1">{t('plans.optimize')}</span>
          <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {/* Separates "Optimize for me" (the default) from the
                three single modes below it. */}
            {index === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              aria-label={item.label}
              aria-describedby={`${hintId}-${item.key}`}
              // Closes the menu itself before invoking its handler, so
              // Radix's own close doesn't race the Modal's focus grab —
              // same fix as the Export menu's onSelect workaround.
              onSelect={(event) => {
                event.preventDefault();
                setOpen(false);
                item.onSelect();
              }}
              disabled={item.disabled}
              className="flex-col items-start"
            >
              <span className={item.emphasize ? 'block font-semibold' : 'block'}>{item.label}</span>
              <span id={`${hintId}-${item.key}`} className="block text-[0.6875rem] text-text-dim">
                {item.hint}
              </span>
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
