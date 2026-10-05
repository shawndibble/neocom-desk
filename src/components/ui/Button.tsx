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
  /**
   * An action is running. A small `Spinner` takes the label's place without
   * moving anything (the label stays laid out, invisible, so the width is
   * locked), the button reports `aria-disabled` and clicks are ignored. It
   * stays focusable and keeps its hover/tooltip behaviour, which a native
   * `disabled` would not. DESIGN.md §6c.
   */
  loading?: boolean;
}

/** Forwards its ref so it can be a Radix or Tooltip trigger directly, e.g. `<Tooltip><Button/></Tooltip>`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'ghost',
    size = 'md',
    align = 'center',
    type = 'button',
    className = '',
    loading = false,
    onClick,
    children,
    ...rest
  },
  ref
) {
  const ariaDisabled =
    loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
  // `aria-disabled` keeps the button focusable and hoverable (so a tooltip can
  // explain why), which also means the browser would still deliver the click.
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
        className: cx(loading && 'relative', className),
      })}
      {...rest}
      aria-disabled={ariaDisabled || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {loading ? (
        <>
          {/* Opacity, not `invisible` (which would drop the label from the accessible name), on a real flex box (opacity does nothing to `display: contents`): the children keep their width, so the button does not resize. */}
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
