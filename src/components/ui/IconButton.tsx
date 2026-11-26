import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import { cx } from '@/lib/cx';
import {
  iconButtonClassName,
  type IconButtonSize,
  type IconButtonTone,
  type IconButtonVariant,
} from './iconButtonClassName';

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  icon: ReactNode;
  label: string;
  tooltip?: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  busy?: boolean;
  variant?: IconButtonVariant;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  openOnTap?: boolean;
  visibleLabel?: string;
  labelAtEveryWidth?: boolean;
  className?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    tooltip,
    onClick,
    pressed,
    disabled = false,
    busy = false,
    variant = 'ghost',
    tone = 'default',
    size = 'md',
    openOnTap,
    visibleLabel,
    labelAtEveryWidth = false,
    className = '',
    ...rest
  },
  ref
) {
  const ariaDisabled = busy || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (ariaDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.();
  };
  return (
    <Tooltip content={tooltip ?? label} openOnTap={openOnTap}>
      <button
        {...rest}
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={ariaDisabled || undefined}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={handleClick}
        className={iconButtonClassName({
          variant,
          tone,
          size,
          withText: visibleLabel === undefined ? false : labelAtEveryWidth ? 'always' : true,
          pressed,
          disabled: disabled || ariaDisabled,
          className,
        })}
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          {icon}
        </span>
        {visibleLabel !== undefined && (
          <span
            aria-hidden="true"
            className={cx('text-xs font-medium', !labelAtEveryWidth && 'hidden md:inline')}
          >
            {visibleLabel}
          </span>
        )}
      </button>
    </Tooltip>
  );
});
