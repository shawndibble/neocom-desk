import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from './Tooltip';

export type StatChipTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

interface StatChipProps {
  label: string;
  value: ReactNode;
  tone?: StatChipTone;
  className?: string;
  /** One-line plain-language explanation, rendered as a small "?" tooltip next to the label. */
  tooltip?: string;
}

const TONE: Record<StatChipTone, string> = {
  default: 'text-text',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function StatChip({
  label,
  value,
  tone = 'default',
  className = '',
  tooltip,
}: StatChipProps) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2.5 text-[0.6875rem] ${className}`}
    >
      <span className="font-semibold tracking-widest text-text-dim uppercase">{label}</span>
      {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      <span className={`font-medium tabular-nums ${TONE[tone]}`}>{value}</span>
    </span>
  );
}
