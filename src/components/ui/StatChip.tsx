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
 * child draws the hairline at its own left edge, then pads past it, and the
 * row is pulled left by that padding, so the chip that starts a line, first
 * or wrapped, has its hairline 8–12px outside the strip. A clip-path cuts
 * off the left side just there (4px out, room for a focus outline) and
 * nothing else, so a value's outline and an over-wide chip stay visible. Put
 * only readouts in a strip; a control beside it goes in the parent row.
 */
export function StatChips({
  dense = false,
  className = '',
  children,
}: {
  /**
   * 8px each side of the hairline instead of 12px, for a narrow column (the
   * plan editor's 20rem sidebar) where the roomy spacing wraps whole-word
   * labels onto extra lines.
   */
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
