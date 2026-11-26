import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { cx } from '@/lib/cx';
import { Spinner } from './Spinner';
import {
  buttonClassName,
  type ButtonAlign,
  type ButtonSize,
  type ButtonVariant,
} from './buttonClassName';

export type { ButtonVariant, ButtonSize, ButtonAlign };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  align?: ButtonAlign;
  loading?: boolean;
  wrap?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'ghost',
    size = 'md',
    align = 'center',
    type = 'button',
    className = '',
    loading = false,
    wrap = false,
    onClick,
    children,
    ...rest
  },
  ref
) {
  const ariaDisabled =
    loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (ariaDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({
        variant,
        size,
        align,
        wrap,
        className: cx(loading && 'relative', className),
      })}
      {...rest}
      aria-disabled={ariaDisabled || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <span className="inline-flex items-center gap-1.5 opacity-0">{children}</span>
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" className="[&>svg]:text-current" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
