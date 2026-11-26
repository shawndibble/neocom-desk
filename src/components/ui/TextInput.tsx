import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { useDescribedBy } from './fieldNote';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size = 'md', type = 'text', className = '', 'aria-describedby': describedBy, ...rest },
  ref
) {
  const described = useDescribedBy(describedBy);
  return (
    <input
      ref={ref}
      type={type}
      className={cx(fieldBaseClassName, fieldSizeClassName[size], className)}
      {...rest}
      aria-describedby={described}
    />
  );
});
