import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** `md` (default) is the page/form size; `sm` matches `Button size="sm"` inside a dense row. */
  size?: ControlSize;
}

/**
 * A single-line field with the house treatment.
 *
 * Exists so the height and type scale live in one place: the ad-hoc inputs this
 * replaced ran `h-6` through `h-9` with three different paddings, which is what
 * made a rename box read as a different control from the `Button` sitting
 * beside it in the same row. Width stays with the caller (`className`) —
 * fields are as wide as their column, never intrinsically.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size = 'md', type = 'text', className = '', ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cx(fieldBaseClassName, fieldSizeClassName[size], className)}
      {...rest}
    />
  );
});
