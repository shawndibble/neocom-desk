import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { useDescribedBy } from './fieldNote';
import * as Icon from './icons';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ControlSize;
  className?: string;
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { size = 'md', className = '', children, 'aria-describedby': describedBy, ...rest },
  ref
) {
  const described = useDescribedBy(describedBy);
  return (
    <div className={cx('relative', className)}>
      <select
        ref={ref}
        className={cx(
          fieldBaseClassName,
          fieldSizeClassName[size],
          'w-full appearance-none',
          size === 'sm' ? 'pr-6' : 'pr-8'
        )}
        {...rest}
        aria-describedby={described}
      >
        {children}
      </select>
      <Icon.Expanded
        size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-dim',
          size === 'sm' ? 'right-1' : 'right-2'
        )}
      />
    </div>
  );
});
