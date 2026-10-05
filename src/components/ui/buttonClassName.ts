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
  // An accent outline rather than a fill: draws the eye to the one control a
  // view is waiting on (e.g. Payees on an empty Mining Tax tab) without
  // spending the view's single `primary`.
  accent:
    'border-accent bg-transparent text-accent enabled:not-aria-disabled:hover:bg-accent/10 enabled:not-aria-disabled:active:bg-accent/20',
  danger:
    'border-danger/60 bg-transparent text-danger enabled:not-aria-disabled:hover:border-danger enabled:not-aria-disabled:hover:bg-danger/10 enabled:not-aria-disabled:active:bg-danger/20',
  // Same outline formula as `danger`, for a toggle that needs the other two
  // status tones (e.g. an RSVP's Accept/Tentative) rather than red.
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
  sm: `${controlHeightClassName.sm} px-2.5 text-[0.6875rem]`,
  md: `${controlHeightClassName.md} px-4 text-xs`,
};

export interface ButtonClassNameOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  align?: ButtonAlign;
  className?: string;
}

/**
 * The class string a `<button>` gets from `variant`/`size`/`align`. Its own
 * module rather than an export off `Button.tsx` so that file keeps exporting
 * only components (the `react-refresh/only-export-components` rule), and so
 * a non-button element that must look like one — a `react-router-dom` `Link`
 * acting as a nav action, say — can match it exactly instead of hand-copying
 * the cascade.
 */
export function buttonClassName({
  variant = 'ghost',
  size = 'md',
  align = 'center',
  className = '',
}: ButtonClassNameOptions = {}): string {
  return `inline-flex items-center gap-1.5 rounded-xs border font-semibold tracking-widest uppercase ${interactiveClassName} ${focusRingClassName} ${disabledClassName} ${ALIGN[align]} ${VARIANT[variant]} ${SIZE[size]} ${className}`;
}
