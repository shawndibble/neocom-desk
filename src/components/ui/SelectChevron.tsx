import * as Icon from './icons';
import type { ControlSize } from './controlStyles';

type SelectChevronProps = Omit<Icon.IconProps, 'size' | 'className'> & { size: ControlSize };

/**
 * The trailing `CaretDown` of a select-shaped trigger (`selectTriggerClassName`):
 * dim, never shrinking, sized to the control. Spreads the rest of its props
 * onto the icon so a Radix `asChild` slot (`SelectPrimitive.Icon`) can pass
 * its own through.
 */
export function SelectChevron({ size, ...props }: SelectChevronProps) {
  return (
    <Icon.Expanded
      aria-hidden="true"
      {...props}
      size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
      className="shrink-0 text-text-dim"
    />
  );
}
