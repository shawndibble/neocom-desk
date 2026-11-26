import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { Tooltip } from './Tooltip';
import { IskFigureGroupContext, RowTappableContext } from './tooltipHold';

interface IskAmountProps {
  value: number;
  revealOn?: 'tap';
  decimals?: number;
  className?: string;
  note?: string;
}

export function IskAmount({ value, decimals = 2, className = '', note }: IskAmountProps) {
  const { t } = useTranslation();
  const rowTappable = useContext(RowTappableContext);
  const inGroup = useContext(IskFigureGroupContext);
  const exact = t('common.iskExact', { amount: formatIsk(value, decimals) });
  return (
    <Tooltip
      content={
        note ? (
          <>
            {exact}
            <br />
            {note}
          </>
        ) : (
          exact
        )
      }
      openOnTap={!rowTappable}
    >
      <span
        tabIndex={inGroup ? -1 : 0}
        data-isk-figure={inGroup ? '' : undefined}
        className={cx(
          'relative cursor-help rounded-xs focus-visible:outline-2 focus-visible:outline-accent',
          className
        )}
      >
        {formatIskCompact(value)}
        <span className="sr-only">
          {' '}
          {exact}
          {note && ` ${note}`}
        </span>
      </span>
    </Tooltip>
  );
}
