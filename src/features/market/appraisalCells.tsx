import type { ReactElement, ReactNode } from 'react';
import { IskAmount } from '@/components/ui';
import { formatIskAuto } from '@/lib/isk';

export function eachCell(value: number | null): string {
  if (value === null) return '—';
  return formatIskAuto(value);
}

export function totalCell(value: number | null): ReactNode {
  if (value === null) return '—';
  return <IskAmount value={value} decimals={0} />;
}

export function comparisonCell(
  total: ReactNode,
  highlighted: boolean,
  suffix?: ReactElement | false,
  prefix?: ReactElement | false
) {
  return (
    <span className={highlighted ? 'font-semibold text-isk-pos' : undefined}>
      {prefix}
      {total}
      {suffix}
    </span>
  );
}
