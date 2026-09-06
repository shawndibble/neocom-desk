import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { usePortalContainer } from './portalContainer';
import { menuContentClassName, menuItemClassName } from './menuStyles';

/**
 * Click-triggered menu. Wraps `radix-ui`'s DropdownMenu — see docs/adr/0004
 * for why: focus movement, typeahead, roving tabindex, submenu timing and
 * screen-reader behaviour are exactly the parts worth not hand-rolling.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  // Inside a `Modal` this is the dialog's own body; everywhere else it is null,
  // which Radix reads as "portal to document.body" — see `portalContainer.ts`.
  const container = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cx(menuContentClassName, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cx(menuItemClassName, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cx(menuItemClassName, className)} {...props}>
      <span aria-hidden="true" className="inline-block w-3 text-center">
        <DropdownMenuPrimitive.ItemIndicator>✓</DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator className={cx('my-1 h-px bg-line', className)} {...props} />
  );
}
