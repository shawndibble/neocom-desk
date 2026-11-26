import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName } from './controlStyles';

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="radio"
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
