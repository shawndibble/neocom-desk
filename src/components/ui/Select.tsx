import { eyebrowClassName } from './eyebrowClassName';
import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { useDescribedBy } from './fieldNote';
import { usePortalContainer } from './portalContainer';
import { SelectChevron } from './SelectChevron';
import {
  highlightedOptionClassName,
  selectTriggerClassName,
  interactiveClassName,
  type ControlSize,
} from './controlStyles';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

interface SelectTriggerProps extends ComponentProps<typeof SelectPrimitive.Trigger> {
  size?: ControlSize;
  active?: boolean;
}

export function SelectTrigger({
  className,
  children,
  size = 'md',
  active,
  'aria-describedby': describedBy,
  ...props
}: SelectTriggerProps) {
  const described = useDescribedBy(describedBy);
  return (
    <SelectPrimitive.Trigger
      className={cx(
        selectTriggerClassName(size),
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[placeholder]:text-text-dim',
        className
      )}
      {...props}
      data-active={active || undefined}
      aria-describedby={described}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <SelectChevron size={size} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cx(
          'motion-pop z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xs border border-line bg-panel text-text shadow-lg shadow-black/50',
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
        'relative flex cursor-pointer items-center rounded-xs py-1.5 pr-2 pl-7 text-sm touch:min-h-9',
        interactiveClassName,
        highlightedOptionClassName,
        'data-[disabled]:cursor-not-allowed data-[disabled]:text-text-dim data-[disabled]:opacity-40 data-[highlighted]:bg-panel-2 data-[highlighted]:text-text active:bg-panel',
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

export const SelectGroup = SelectPrimitive.Group;

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cx(eyebrowClassName, 'px-2 pt-2 pb-1 pl-7', className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cx('my-1 h-px bg-line', className)} {...props} />;
}
