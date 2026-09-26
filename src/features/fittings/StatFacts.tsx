import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { unheatedIfChanged } from '@/engine/fittings/stats';

/**
 * An overheated value beside its normal one, in the warning tone — the
 * game marks heat the same way. Renders nothing when `value` is null.
 */
export function Overheated({
  value,
  digits,
  unit = '',
}: {
  value: number | null;
  digits: number;
  unit?: string;
}) {
  const { t } = useTranslation();
  if (value === null) return null;
  return (
    <span className="ml-1 text-warning">
      {t('fittings.stats.overheated', { value: `${value.toFixed(digits)}${unit}` })}
    </span>
  );
}

/**
 * One figure as `format` shows it. Under "Overheat all" it reads in the
 * warning tone — the game's own mark for heat — only when heat changed it as
 * shown, with the unheated figure on hover; a figure heat leaves as it is
 * (a hold, the mass, a fitting budget) stays in the normal tone.
 */
export function HeatFigure<S extends { unheated: S | null }>({
  stats,
  format,
}: {
  stats: S;
  format: (stats: S) => string;
}) {
  const { t } = useTranslation();
  const unheated = unheatedIfChanged(stats, format);
  if (unheated === null) return <>{format(stats)}</>;
  return (
    <span className="text-warning" title={t('fittings.stats.unheated', { value: unheated })}>
      {format(stats)}
    </span>
  );
}

export interface Fact {
  label: string;
  value: ReactNode;
}

/** Label-over-value pairs, two to a row — the compact body most stats sections use. */
export function Facts({ items }: { items: Fact[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs tabular-nums">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[0.6875rem] text-text-dim">{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
