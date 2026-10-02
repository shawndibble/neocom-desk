import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from './Tooltip';
import { STAT_CHIP_TONE_TEXT_CLASS, type StatChipTone } from './statChipTone';

export type { StatChipTone };

interface StatChipProps {
  label: string;
  value: ReactNode;
  tone?: StatChipTone;
  className?: string;
  /** One-line plain-language explanation, rendered as a small "?" tooltip next to the label. */
  tooltip?: string;
  testId?: string;
}

/**
 * A static label + value readout. It has no border or fill: a box means
 * "you can click this" (DESIGN.md §6), and a chip can't be clicked.
 */
export function StatChip({
  label,
  value,
  tone = 'default',
  className = '',
  tooltip,
  testId,
}: StatChipProps) {
  const { t } = useTranslation();
  return (
    <span
      data-testid={testId}
      // `h-7` is a fixed height, level with an `sm` control beside it, so the
      // chip cannot absorb a second line of text: left to shrink, a flex row
      // squeezes it until the label wraps under the value. `shrink-0` +
      // `whitespace-nowrap` make the chip indivisible, so a wrapping strip
      // moves the whole chip to the next line instead.
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 text-[0.6875rem] whitespace-nowrap ${className}`}
    >
      <span className="font-semibold tracking-widest text-text-dim uppercase">{label}</span>
      {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      <span className={`font-medium tabular-nums ${STAT_CHIP_TONE_TEXT_CLASS[tone]}`}>{value}</span>
    </span>
  );
}

/**
 * A strip of `StatChip`s, with a short hairline between neighbours. Each
 * child draws the hairline at its own left edge, and the row is pulled left
 * under a clip by exactly that much, so the chip that starts a line, first or
 * wrapped, never shows one. Put only readouts in a strip; a control beside it
 * goes in the parent row.
 */
export function StatChips({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 overflow-hidden ${className}`}>
      <div className="-ml-[13px] flex flex-wrap items-center gap-x-3 *:relative *:pl-3 *:before:absolute *:before:top-1/2 *:before:left-0 *:before:h-3.5 *:before:w-px *:before:-translate-y-1/2 *:before:bg-line">
        {children}
      </div>
    </div>
  );
}
