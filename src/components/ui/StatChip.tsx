import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { focusRingClassName, interactiveClassName } from './controlStyles';
import { InfoTooltip } from './Tooltip';
import { STAT_CHIP_TONE_TEXT_CLASS, type StatChipTone } from './statChipTone';

export type { StatChipTone };

interface StatChipProps {
  /** @summary Already-translated uppercase micro-heading. */
  label: string;
  /** @summary The figure or text shown after the label. */
  value: ReactNode;
  /** @summary Colour of the value: `default`, or a status tone. */
  tone?: StatChipTone;
  className?: string;
  tooltip?: string;
  tooltipGlyph?: 'help' | 'info';
  testId?: string;
  emphasis?: boolean;
  truncate?: boolean;
  to?: string;
}

/**
 * @summary A static label and value readout (ISK balance, SP, a count); no box, because it can't be clicked.
 */
export function StatChip({
  label,
  value,
  tone = 'default',
  className = '',
  tooltip,
  tooltipGlyph,
  testId,
  emphasis = false,
  truncate = false,
  to,
}: StatChipProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const linkId = useId();
  return (
    <span
      data-testid={testId}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 text-[0.6875rem] whitespace-nowrap ${truncate ? 'max-w-full' : ''} ${className}`}
    >
      <span id={labelId} className="font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </span>
      {tooltip && (
        <InfoTooltip
          label={t('common.aboutLabel', { label })}
          content={tooltip}
          glyph={tooltipGlyph}
        />
      )}
      <span
        className={`tabular-nums ${emphasis ? 'text-sm font-semibold' : 'font-medium'} ${truncate ? 'min-w-0 truncate' : ''} ${STAT_CHIP_TONE_TEXT_CLASS[tone]}`}
      >
        {to ? (
          <Link
            id={linkId}
            to={to}
            aria-labelledby={`${labelId} ${linkId}`}
            className={`rounded-xs underline decoration-1 underline-offset-2 hover:decoration-2 ${interactiveClassName} ${focusRingClassName}`}
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </span>
    </span>
  );
}

/**
 * @summary A wrapping strip of `StatChip`s with a hairline between neighbours.
 */
export function StatChips({
  dense = false,
  className = '',
  children,
}: {
  dense?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const spacing = dense ? '-ml-2 gap-x-2 *:pl-2' : '-ml-3 gap-x-3 *:pl-3';
  return (
    <div className={`min-w-0 [clip-path:inset(-100vmax_-100vmax_-100vmax_-4px)] ${className}`}>
      <div
        className={`${spacing} flex flex-wrap items-center *:relative *:before:absolute *:before:top-1/2 *:before:left-0 *:before:h-3.5 *:before:w-px *:before:-translate-y-1/2 *:before:bg-line`}
      >
        {children}
      </div>
    </div>
  );
}
