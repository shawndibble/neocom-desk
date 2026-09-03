import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { controlHeightClassName, type ControlSize } from './controlStyles';

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

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-accent-contrast hover:bg-accent/85',
  ghost: 'border-line bg-transparent text-text hover:border-line-bright hover:bg-panel-2',
  danger: 'border-danger/60 bg-transparent text-danger hover:border-danger hover:bg-danger/10',
};

const ALIGN: Record<ButtonAlign, string> = {
  center: 'justify-center',
  start: 'justify-start text-left',
};

const SIZE: Record<ButtonSize, string> = {
  sm: `${controlHeightClassName.sm} px-2.5 text-[0.6875rem]`,
  md: `${controlHeightClassName.md} px-4 text-xs`,
};

/** Forwards its ref so it can be a Radix or Tooltip trigger directly, e.g. `<Tooltip><Button/></Tooltip>`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', align = 'center', type = 'button', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-xs border font-semibold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 ${ALIGN[align]} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
});
