import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName } from './controlStyles';

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * The app's one native radio button: a fixed 16px square that never shrinks in a
 * flex row, a pointer cursor, the accent colour, and one disabled look
 * (`cursor-not-allowed opacity-40`).
 *
 * About thirty sites each hand-copied this string, and four had already grown
 * their own disabled treatment. Layout nudges (`mt-0.5` on a multi-line row)
 * and focus outlines stay the caller's `className`.
 *
 * No touch hit area of its own: a pseudo-element on a native control is not
 * drawn everywhere, so the 44px target is the wrapping label's
 * (`tappableRowClassName` rows, or `touchCheckboxLabelClassName` for a bare one).
 */
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
