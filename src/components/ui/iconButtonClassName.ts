import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

export type IconButtonVariant = 'ghost' | 'plain';
export type IconButtonTone = 'default' | 'danger' | 'positive' | 'warning' | 'accent';
export type IconButtonSize = 'md' | 'sm' | 'row';

export interface IconButtonClassNameOptions {
  variant?: IconButtonVariant;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  pressed?: boolean;
  disabled?: boolean;
  withText?: boolean | 'always';
  className?: string;
}

export function iconButtonClassName({
  variant = 'ghost',
  tone = 'default',
  size = 'md',
  pressed,
  disabled = false,
  withText = false,
  className = '',
}: IconButtonClassNameOptions = {}): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-xs',
    interactiveClassName,
    focusRingClassName,
    disabledClassName,
    withText === 'always'
      ? 'h-9 gap-1.5 px-2.5 touch:min-w-9'
      : withText
        ? size === 'sm' || size === 'row'
          ? 'size-9 md:size-auto md:h-7 md:gap-1.5 md:px-2 touch:h-9 touch:min-w-9'
          : 'size-9 md:size-auto md:h-9 md:gap-1.5 md:px-2.5 touch:h-9 touch:min-w-9'
        : size === 'md'
          ? 'size-9'
          : size === 'row'
            ? 'size-9 md:size-7 touch:size-9'
            : 'size-9 md:size-7 touch:size-9',
    variant === 'ghost' && 'border',
    pressed === true
      ? cx(
          'bg-accent/12 text-accent',
          variant === 'ghost' && 'border-accent',
          !disabled && 'hover:bg-accent/20 active:bg-accent/28'
        )
      : tone === 'danger'
        ? cx(
            'text-danger',
            variant === 'ghost' && 'border-danger/60',
            !disabled && 'hover:bg-danger/10 active:bg-danger/20',
            variant === 'ghost' && !disabled && 'hover:border-danger'
          )
        : tone === 'positive'
          ? cx(
              'text-isk-pos',
              variant === 'ghost' && 'border-line',
              !disabled && 'hover:bg-isk-pos/10 active:bg-isk-pos/20',
              variant === 'ghost' && !disabled && 'hover:border-isk-pos'
            )
          : tone === 'accent'
            ? cx(
                'text-accent',
                variant === 'ghost' && 'border-line',
                !disabled && 'hover:bg-accent/10 active:bg-accent/20',
                variant === 'ghost' && !disabled && 'hover:border-accent'
              )
            : tone === 'warning'
              ? cx(
                  'text-warning',
                  variant === 'ghost' && 'border-line',
                  !disabled && 'hover:bg-warning/10 active:bg-warning/20',
                  variant === 'ghost' && !disabled && 'hover:border-warning'
                )
              : cx(
                  'text-text-dim',
                  variant === 'ghost' && 'border-line',
                  !disabled && 'hover:text-text active:bg-panel',
                  variant === 'plain' && !disabled && 'hover:bg-panel-2',
                  variant === 'ghost' && 'bg-panel-2',
                  variant === 'ghost' && !disabled && 'hover:border-line-bright'
                ),
    className
  );
}
