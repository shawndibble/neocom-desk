import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { menuContentClassName, menuItemClassName } from './menuStyles';

/**
 * Right-click menu. Wraps `radix-ui`'s ContextMenu — see docs/adr/0004 for
 * why: focus movement, typeahead, roving tabindex, submenu timing and
 * screen-reader behaviour are exactly the parts worth not hand-rolling.
 */
export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cx(menuContentClassName, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item className={cx(menuItemClassName, className)} {...props} />;
}

export function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator className={cx('my-1 h-px bg-line', className)} {...props} />
  );
}

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cx(menuItemClassName, 'justify-between data-[state=open]:bg-panel-2', className)}
      {...props}
    >
      {children}
      <span aria-hidden="true" className="text-text-dim">
        ›
      </span>
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent className={cx(menuContentClassName, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}
