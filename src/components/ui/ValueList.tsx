import { createContext, useContext, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { STAT_CHIP_TONE_TEXT_CLASS, type StatChipTone } from './statChipTone';

type ValueListVariant = 'divided' | 'plain';

const VariantContext = createContext<ValueListVariant>('divided');

interface ValueListProps {
  variant?: ValueListVariant;
  className?: string;
  children: ReactNode;
}

export function ValueList({ variant = 'divided', className, children }: ValueListProps) {
  return (
    <VariantContext.Provider value={variant}>
      <dl
        className={cx(
          'text-sm',
          variant === 'divided' ? 'divide-y divide-line' : 'space-y-1',
          className
        )}
      >
        {children}
      </dl>
    </VariantContext.Provider>
  );
}

interface ValueRowProps {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatChipTone;
}

export function ValueRow({ label, value, note, tone = 'default' }: ValueRowProps) {
  const variant = useContext(VariantContext);
  return (
    <div
      className={cx(
        'flex items-baseline justify-between gap-3',
        variant === 'divided' && 'py-2 first:pt-0 last:pb-0'
      )}
    >
      <dt className="min-w-0">
        {label}
        {note !== undefined && note !== null && (
          <span className="ml-1 text-text-dim">
            <span className="sr-only">, </span>
            {note}
          </span>
        )}
      </dt>
      <dd className={cx('shrink-0 tabular-nums', STAT_CHIP_TONE_TEXT_CLASS[tone])}>{value}</dd>
    </div>
  );
}
