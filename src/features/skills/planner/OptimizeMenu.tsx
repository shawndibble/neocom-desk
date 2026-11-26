import { Fragment, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';

export interface OptimizeMenuItem {
  key: string;
  label: string;
  hint: string;
  disabled: boolean;
  onSelect: () => void;
  emphasize?: boolean;
}

interface OptimizeMenuProps {
  items: readonly OptimizeMenuItem[];
  disabled: boolean;
}

export function OptimizeMenu({ items, disabled }: OptimizeMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hintId = useId();
  return (
    <DropdownMenu open={open} onOpenChange={(next) => setOpen(next && !disabled)}>
      <Tooltip content={disabled ? t('plans.optimizeNeedsSkills') : null} className="w-full">
        <DropdownMenuTrigger asChild>
          <Button size="md" align="start" className="w-full" aria-disabled={disabled || undefined}>
            <span aria-hidden="true" className="shrink-0 text-text-dim">
              <Icon.OptimizeRemaps size={Icon.ICON_SIZE.sm} />
            </span>
            <span className="flex-1">{t('plans.optimize')}</span>
            <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64">
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              aria-label={item.label}
              aria-describedby={`${hintId}-${item.key}`}
              onSelect={(event) => {
                event.preventDefault();
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              aria-disabled={item.disabled || undefined}
              className="flex-col items-start aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
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
