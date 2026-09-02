import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import * as Icon from './icons';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

/**
 * Listbox select. Wraps `radix-ui`'s Select — see docs/adr/0004 for why:
 * focus movement, typeahead, roving tabindex and screen-reader behaviour are
 * exactly the parts worth not hand-rolling.
 *
 * For a short, static option list inside a form, reach for `NativeSelect`
 * instead — both draw from the same `controlStyles` tokens, so the choice is
 * about behaviour, never about how it looks.
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

interface SelectTriggerProps extends ComponentProps<typeof SelectPrimitive.Trigger> {
  /** `md` (default) is the page/form size; `sm` matches `Button size="sm"` inside a dense row. */
  size?: ControlSize;
}

export function SelectTrigger({ className, children, size = 'md', ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cx(
        fieldBaseClassName,
        fieldSizeClassName[size],
        'flex items-center justify-between gap-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[placeholder]:text-text-dim',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon.Expanded
          aria-hidden="true"
          size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
          className="shrink-0 text-text-dim"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cx(
          'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xs border border-line bg-panel text-text shadow-lg shadow-black/50',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cx(
        'relative flex cursor-pointer items-center rounded-xs py-1.5 pr-2 pl-7 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:text-text-dim data-[disabled]:opacity-50 data-[highlighted]:bg-panel-2 data-[highlighted]:text-text',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        className="absolute left-2 inline-flex items-center"
        aria-hidden="true"
      >
        ✓
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cx('my-1 h-px bg-line', className)} {...props} />;
}
