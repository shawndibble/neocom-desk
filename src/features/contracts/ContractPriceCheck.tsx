/**
 * The price check on a contract detail panel: what the contract's items come
 * to at the hub, held against the ask. Presentational: the panel computes the
 * rows (`engine/contracts/contractPriceCheck`) and hands them in already
 * formatted, so the same block serves an own contract's issue-day check, a
 * live Contract Search check and a BPC per-run check.
 *
 * Neutral type unless a row carries a `tone`: a contract does not say which
 * side the reader is on, so only a panel that knows (the buyer's Saving) tints
 * a value with `isk-pos`/`isk-neg`. The row's note says it in words too.
 *
 * The side label, when the panel offers a flip, is accent text with no
 * underline and a tooltip naming the press (DESIGN.md §6c: a value that flips
 * in place). Nothing navigates, so it is not a link.
 */
import type { ReactNode } from 'react';
import { Eyebrow, Spinner, Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

// min-h-6: the 24px target floor (DESIGN.md §3) for a text-sized control.
const flipClassName = `min-h-6 shrink-0 whitespace-nowrap font-semibold text-accent text-left rounded-xs ${interactiveClassName} ${focusRingClassName}`;

export interface PriceCheckRowModel {
  label: string;
  value: string;
  note?: string;
  /** A part of the row above it: indented, no rule of its own weight. */
  sub?: boolean;
  /** An estimate, not a hub figure: dimmed so it does not read as part of the verdict. */
  dim?: boolean;
  /** A gain or loss for the reader; tints the value. The note repeats it in words. */
  tone?: 'good' | 'bad';
}

export interface PriceCheckFlip {
  /** The side being shown ("Buy orders"). */
  label: string;
  /** Tooltip: what a press shows ("Show sell orders"). */
  showOther: string;
  onFlip: () => void;
}

export function ContractPriceCheck({
  heading,
  rows,
  flip,
  message,
  busy = false,
}: {
  heading: string;
  rows: readonly PriceCheckRowModel[];
  flip?: PriceCheckFlip;
  /** Replaces the rows with why there is no figure (no prices, no data for that day). */
  message?: ReactNode;
  busy?: boolean;
}) {
  return (
    <section aria-label={heading}>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>{heading}</Eyebrow>
        {flip && (
          <Tooltip content={flip.showOther}>
            <button type="button" className={flipClassName} onClick={flip.onFlip}>
              {flip.label}
            </button>
          </Tooltip>
        )}
      </div>
      {busy ? (
        <div className="flex justify-center py-3">
          <Spinner size="sm" label={heading} />
        </div>
      ) : message ? (
        <p className="border-y border-line py-2 text-text-dim">{message}</p>
      ) : (
        <dl className="mt-1 divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cx('flex items-baseline justify-between gap-3 py-1.5', row.sub && 'pl-3')}
            >
              <dt className="text-text-dim">{row.label}</dt>
              <dd className="text-right">
                <span
                  className={cx(
                    'tabular-nums font-semibold',
                    row.dim && 'text-text-dim',
                    row.tone === 'good' && 'text-isk-pos',
                    row.tone === 'bad' && 'text-isk-neg'
                  )}
                >
                  {row.value}
                </span>
                {row.note && <span className="block text-text-dim">{row.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
