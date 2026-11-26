import { eyebrowClassName } from './eyebrowClassName';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { InlineCaret, InlineSubContent, InlineSubRoot, SidePanelSubRoot } from './inlineSubmenu';
import { inlineTriggerProps, useInlineSub, useInlineSubmenus } from './inlineSubmenuState';
import { usePortalContainer } from './portalContainer';
import {
  MENU_COLLISION_PADDING,
  menuContentClassName,
  menuItemClassName,
  menuScrollClassName,
  menuSubContentClassName,
} from './menuStyles';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export function ContextMenuSub(props: ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  const inline = useInlineSubmenus();
  if (inline) return <InlineSubRoot>{props.children}</InlineSubRoot>;
  return (
    <SidePanelSubRoot>
      <ContextMenuPrimitive.Sub {...props} />
    </SidePanelSubRoot>
  );
}

export function ContextMenuContent({
  className,
  collisionPadding = MENU_COLLISION_PADDING,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <ContextMenuPrimitive.Portal container={container}>
      <ContextMenuPrimitive.Content
        collisionPadding={collisionPadding}
        className={cx(menuContentClassName, menuScrollClassName, className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item className={cx(menuItemClassName, className)} {...props} />;
}

export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

export function ContextMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem className={cx(menuItemClassName, className)} {...props}>
      <span aria-hidden="true" className="inline-block w-3 text-center">
        <ContextMenuPrimitive.ItemIndicator>✓</ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

export function ContextMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem className={cx(menuItemClassName, className)} {...props}>
      <span aria-hidden="true" className="inline-block w-3 text-center">
        <ContextMenuPrimitive.ItemIndicator>✓</ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export function ContextMenuLabel({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label
      role="presentation"
      className={cx(eyebrowClassName, 'px-2 py-1.5', className)}
      {...props}
    />
  );
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
  const inline = useInlineSub();
  if (inline) {
    return (
      <ContextMenuItem {...inlineTriggerProps(inline, className)} disabled={props.disabled}>
        {children}
        <InlineCaret open={inline.open} />
      </ContextMenuItem>
    );
  }
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
  collisionPadding = MENU_COLLISION_PADDING,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  const container = usePortalContainer();
  const inline = useInlineSub();
  if (inline) {
    return (
      <InlineSubContent inline={inline} className={className}>
        {props.children}
      </InlineSubContent>
    );
  }
  return (
    <ContextMenuPrimitive.Portal container={container}>
      <ContextMenuPrimitive.SubContent
        collisionPadding={collisionPadding}
        className={cx(menuSubContentClassName, className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}
