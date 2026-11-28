import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { cx } from '@/lib/cx';
import { formatSignedPercent } from '@/lib/formatSignedPercent';
import {
  DELTA_TONE_CLASS,
  UNIT_KEYS,
  compareDelta,
  formatCompareValue,
  isAbsentValue,
  type CompareColumn,
} from './compareFormat';

export function CompareLetterTag({ letter, always = false }: { letter: string; always?: boolean }) {
  return (
    <span className={always ? undefined : 'md:hidden'} aria-hidden="true">
      <Pill>{letter}</Pill>
    </span>
  );
}

export function CompareValue({
  row,
  column,
  withUnit = false,
  deltaClassName,
  children,
}: {
  row: CompareRow;
  column: CompareColumn;
  withUnit?: boolean;
  deltaClassName?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { position } = column;
  const absent = isAbsentValue(row, position);
  const best = position !== null && row.bestIndices.includes(position);
  const unstable = row.key === 'capacitor' && !absent && row.values[position!]! < 0;
  const delta = compareDelta(row, position);
  const isPrice = row.key === 'priceSell' || row.key === 'priceBuy';
  let value: ReactNode = '—';
  if (!absent) {
    const text = formatCompareValue(row, position!, t);
    value = isPrice ? (
      <IskAmount value={row.values[position!]!} decimals={0} />
    ) : withUnit && UNIT_KEYS.has(row.key) ? (
      t(`fittings.compare.unit.${row.key}`, { value: text })
    ) : (
      text
    );
  }
  return (
    <>
      <span
        className={cx(
          'tabular-nums',
          absent ? 'text-text-dim' : 'text-text',
          best && 'font-semibold',
          unstable && 'text-danger'
        )}
      >
        {value}
        {best && <span className="sr-only"> {t('fittings.compare.best')}</span>}
      </span>
      {children}
      {delta && (
        <span className={cx('text-xs tabular-nums', DELTA_TONE_CLASS[delta.tone], deltaClassName)}>
          {formatSignedPercent(delta.percent)}
          <span className="sr-only"> {t('fittings.compare.againstBaseline')}</span>
        </span>
      )}
    </>
  );
}
