import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName } from './controlStyles';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cx(
        'size-4 shrink-0 cursor-pointer accent-accent',
        focusRingClassName,
        disabledClassName,
        className
      )}
      {...rest}
    />
  );
});
