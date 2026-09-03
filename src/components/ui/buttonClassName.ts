import { controlHeightClassName } from './controlStyles';
import type { ButtonAlign, ButtonSize, ButtonVariant } from './Button';

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
  return `inline-flex items-center gap-1.5 rounded-xs border font-semibold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 ${ALIGN[align]} ${VARIANT[variant]} ${SIZE[size]} ${className}`;
}
