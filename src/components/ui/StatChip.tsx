import type { ReactNode } from 'react';

export type StatChipTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

interface StatChipProps {
  label: string;
  value: ReactNode;
  tone?: StatChipTone;
  className?: string;
}

const TONE: Record<StatChipTone, string> = {
  default: 'text-text',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function StatChip({ label, value, tone = 'default', className = '' }: StatChipProps) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-2 rounded-xs border border-line bg-panel-2 px-2.5 text-[11px] ${className}`}
    >
      <span className="font-semibold tracking-widest text-text-dim uppercase">{label}</span>
      <span className={`font-medium tabular-nums ${TONE[tone]}`}>{value}</span>
    </span>
  );
}
