import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { menuContentClassName } from './menuStyles';

/**
 * Click-triggered informational overlay, on the same surface as the menus but
 * with a `dialog` role rather than `menu` — it holds prose and figures, not
 * commands, and a menu role would promise arrow-key item navigation that isn't
 * there. Radix (docs/adr/0004) owns dismissal, focus return and collision-aware
 * placement, exactly as it does for `DropdownMenu`.
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cx(menuContentClassName, className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
