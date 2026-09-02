import type { ButtonHTMLAttributes } from 'react';
import { controlHeightClassName, type ControlSize } from './controlStyles';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = ControlSize;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-accent-contrast hover:bg-accent/85',
  ghost: 'border-line bg-transparent text-text hover:border-line-bright hover:bg-panel-2',
  danger: 'border-danger/60 bg-transparent text-danger hover:border-danger hover:bg-danger/10',
};

const SIZE: Record<ButtonSize, string> = {
  sm: `${controlHeightClassName.sm} px-2.5 text-[0.6875rem]`,
  md: `${controlHeightClassName.md} px-4 text-xs`,
};

export function Button({
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xs border font-semibold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
}
