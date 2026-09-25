import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * The app's one native checkbox: a fixed 16px square that never shrinks in a
 * flex row, a pointer cursor, the accent colour, and one disabled look
 * (`cursor-not-allowed opacity-50`).
 *
 * About thirty sites each hand-copied this string, and four had already grown
 * their own disabled treatment. Layout nudges (`mt-0.5` on a multi-line row)
 * and focus outlines stay the caller's `className`.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cx(
        'size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    />
  );
});
