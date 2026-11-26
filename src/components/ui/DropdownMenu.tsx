import { eyebrowClassName } from './eyebrowClassName';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
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

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuSub(props: ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  const inline = useInlineSubmenus();
  if (inline) return <InlineSubRoot>{props.children}</InlineSubRoot>;
  return (
    <SidePanelSubRoot>
      <DropdownMenuPrimitive.Sub {...props} />
    </SidePanelSubRoot>
  );
}

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = MENU_COLLISION_PADDING,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cx(menuContentClassName, menuScrollClassName, className)}
        {...props}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.key === 'Tab' && !event.defaultPrevented) {
            event.preventDefault();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
        }}
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

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      role="presentation"
      className={cx(eyebrowClassName, 'px-2 py-1.5', className)}
      {...props}
    />
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  const inline = useInlineSub();
  if (inline) {
    return (
      <DropdownMenuItem {...inlineTriggerProps(inline, className)} disabled={props.disabled}>
        {children}
        <InlineCaret open={inline.open} />
      </DropdownMenuItem>
    );
  }
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
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.SubContent
        collisionPadding={collisionPadding}
        className={cx(menuSubContentClassName, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
