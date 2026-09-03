import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { ControlSize } from './controlStyles';
import { buttonClassName } from './buttonClassName';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = ControlSize;
export type ButtonAlign = 'center' | 'start';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Content alignment. `start` is for a full-width button in a vertical stack
   * (the plan tools sidebar), where centred labels of differing lengths leave
   * the leading icons jagged down the column.
   *
   * A prop rather than a `justify-start` appended to `className`: both
   * utilities sit in the same cascade layer at the same specificity, so which
   * one wins is decided by their order in Tailwind's generated stylesheet,
   * not by their order in the class string.
   */
  align?: ButtonAlign;
}

/** Forwards its ref so it can be a Radix or Tooltip trigger directly, e.g. `<Tooltip><Button/></Tooltip>`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', align = 'center', type = 'button', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, align, className })}
      {...rest}
    />
  );
});
