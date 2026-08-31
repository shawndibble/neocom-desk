import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

/**
 * Listbox select. Wraps `radix-ui`'s Select — see docs/adr/0004 for why:
 * focus movement, typeahead, roving tabindex and screen-reader behaviour are
 * exactly the parts worth not hand-rolling.
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cx(
        'flex h-9 items-center justify-between gap-2 rounded-xs border border-line bg-panel px-3 text-sm text-text outline-none focus-visible:outline-2 focus-visible:outline-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[placeholder]:text-text-dim',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <span aria-hidden="true" className="text-text-dim">
          ▾
        </span>
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
