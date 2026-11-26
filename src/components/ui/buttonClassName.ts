import {
  controlHeightClassName,
  disabledClassName,
  focusRingClassName,
  interactiveClassName,
  type ControlSize,
} from './controlStyles';

export type ButtonVariant = 'primary' | 'ghost' | 'accent' | 'danger' | 'success' | 'warning';
export type ButtonSize = ControlSize;
export type ButtonAlign = 'center' | 'start';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-accent bg-accent text-accent-contrast enabled:not-aria-disabled:hover:bg-accent/85 enabled:not-aria-disabled:active:bg-accent/70',
  ghost:
    'border-line bg-transparent text-text enabled:not-aria-disabled:hover:border-line-bright enabled:not-aria-disabled:hover:bg-panel-2 enabled:not-aria-disabled:active:bg-panel',
  accent:
    'border-accent bg-transparent text-accent enabled:not-aria-disabled:hover:bg-accent/10 enabled:not-aria-disabled:active:bg-accent/20',
  danger:
    'border-danger/60 bg-transparent text-danger enabled:not-aria-disabled:hover:border-danger enabled:not-aria-disabled:hover:bg-danger/10 enabled:not-aria-disabled:active:bg-danger/20',
  success:
    'border-success/60 bg-transparent text-success enabled:not-aria-disabled:hover:border-success enabled:not-aria-disabled:hover:bg-success/10 enabled:not-aria-disabled:active:bg-success/20',
  warning:
    'border-warning/60 bg-transparent text-warning enabled:not-aria-disabled:hover:border-warning enabled:not-aria-disabled:hover:bg-warning/10 enabled:not-aria-disabled:active:bg-warning/20',
};

const ALIGN: Record<ButtonAlign, string> = {
  center: 'justify-center',
  start: 'justify-start text-left',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 text-[0.6875rem]',
  md: 'px-4 text-xs',
};

const WRAP: Record<ButtonSize, string> = {
  sm: 'h-auto min-h-9 py-1 text-center whitespace-normal md:min-h-7 touch:min-h-9',
  md: 'h-auto min-h-9 py-1.5 text-center whitespace-normal',
};

export interface ButtonClassNameOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  align?: ButtonAlign;
  wrap?: boolean;
  className?: string;
}

export function buttonClassName({
  variant = 'ghost',
  size = 'md',
  align = 'center',
  wrap = false,
  className = '',
}: ButtonClassNameOptions = {}): string {
  return `inline-flex items-center gap-1.5 rounded-xs border font-semibold tracking-widest uppercase ${interactiveClassName} ${focusRingClassName} ${disabledClassName} ${ALIGN[align]} ${VARIANT[variant]} ${wrap ? WRAP[size] : controlHeightClassName[size]} ${SIZE[size]} ${className}`;
}
