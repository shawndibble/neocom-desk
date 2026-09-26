import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { usePortalContainer } from './portalContainer';
import {
  MENU_COLLISION_PADDING,
  menuContentClassName,
  menuItemClassName,
  menuSubContentClassName,
} from './menuStyles';

/**
 * Click-triggered menu. Wraps `radix-ui`'s DropdownMenu — see docs/adr/0004
 * for why: focus movement, typeahead, roving tabindex, submenu timing and
 * screen-reader behaviour are exactly the parts worth not hand-rolling.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

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

export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** One of a set of choices, the current one ticked — as `ContextMenuRadioItem` marks its own. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cx(menuItemClassName, className)} {...props}>
      <span aria-hidden="true" className="inline-block w-3 text-center">
        <DropdownMenuPrimitive.ItemIndicator>✓</DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
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

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cx(menuItemClassName, 'justify-between data-[state=open]:bg-panel-2', className)}
      {...props}
    >
      {children}
      <span aria-hidden="true" className="text-text-dim">
        ›
      </span>
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  collisionPadding = MENU_COLLISION_PADDING,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  // Inside a `Modal` this is the dialog's own body; everywhere else it is null,
  // which Radix reads as "portal to document.body" — see `portalContainer.ts`.
  const container = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.SubContent
        collisionPadding={collisionPadding}
        className={cx(menuSubContentClassName, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
