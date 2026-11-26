import * as Icon from './icons';
import type { ControlSize } from './controlStyles';

type SelectChevronProps = Omit<Icon.IconProps, 'size' | 'className'> & { size: ControlSize };

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
