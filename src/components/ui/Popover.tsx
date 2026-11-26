import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { usePortalContainer } from './portalContainer';
import { RowTappableContext } from './tooltipHold';
import { menuContentClassName } from './menuStyles';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

type PopoverContentBaseProps = Omit<
  ComponentProps<typeof PopoverPrimitive.Content>,
  'aria-label' | 'aria-labelledby'
> & {
  arrow?: boolean;
};

export type PopoverContentProps = PopoverContentBaseProps &
  (
    | { 'aria-label': string; 'aria-labelledby'?: string }
    | { 'aria-labelledby': string; 'aria-label'?: string }
  );

export function PopoverContent({
  className,
  sideOffset = 4,
  arrow = false,
  children,
  ...props
}: PopoverContentProps) {
  const container = usePortalContainer();
  return (
    <RowTappableContext.Provider value={false}>
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          sideOffset={sideOffset}
          className={cx(
            menuContentClassName,
            !className?.includes('max-h-') &&
              'max-h-[min(32rem,var(--radix-popover-content-available-height))]',
            'overflow-y-auto overscroll-contain motion-pop-exit',
            className
          )}
          {...props}
        >
          {children}
          {arrow && (
            <PopoverPrimitive.Arrow
              width={12}
              height={6}
              className="fill-panel stroke-line"
              aria-hidden
            />
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </RowTappableContext.Provider>
  );
}
