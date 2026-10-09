import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';

/** How long the "copied" bubble stays over the figure. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * An Appraisal's headline Sell or Buy total, in full with the shorthand after
 * it — `2,800,260,000 ISK (2.8B)` — that copies itself on click.
 *
 * In full, unlike the rest of the Appraisal's ISK, because this is the figure
 * a pilot pastes into a contract or a buyback chat; the shorthand stays for
 * the glance. A click copies the grouped digits (`2,800,260,000`, the same
 * text the Hub Compare cards copy) and says so in a bubble on the figure
 * itself — not a tooltip, which a touch tap never opens, and not a toast in a
 * corner, away from what was clicked.
 *
 * `compact` prints the shorthand alone (`2.8B`) with the exact figure in a
 * hover/focus tooltip, for the result header's narrow groups, where a
 * ten-digit figure ran under its neighbour. The click still copies the full
 * digits.
 */
export function FullIskTotal({ value, compact = false }: { value: number; compact?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  const full = formatIsk(value, 0);
  const short = formatIskCompact(value);

  async function copy() {
    try {
      await writeToClipboard(full);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  const button = (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={
        compact
          ? t('market.appraisal.copyTotalCompact', { short, full })
          : t('market.appraisal.copyTotal', { amount: t('common.iskExact', { amount: full }) })
      }
      className={`cursor-copy rounded-xs hover:underline ${interactiveClassName} ${focusRingClassName}`}
    >
      {compact
        ? short
        : /* Exception: the exact figure is printed beside the shorthand, so IskAmount's tooltip would repeat it. */
          t('market.appraisal.totalFull', { full, short })}
    </button>
  );

  return (
    <span className="relative inline-flex">
      {compact ? (
        <Tooltip content={t('common.iskExact', { amount: full })}>{button}</Tooltip>
      ) : (
        button
      )}
      {/* Mounted only while showing, so a page of these isn't a page of
        empty live regions competing with its own status line. */}
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-text normal-case shadow-md"
        >
          {compact
            ? t('market.appraisal.copiedAmount', { amount: t('common.iskExact', { amount: full }) })
            : t('market.appraisal.copiedToClipboard')}
        </span>
      )}
    </span>
  );
}
