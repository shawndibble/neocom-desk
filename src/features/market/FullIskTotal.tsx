import { useTranslation } from 'react-i18next';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';

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
 */
export function FullIskTotal({ value }: { value: number }) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback(COPIED_FEEDBACK_MS);

  const full = formatIsk(value, 0);
  const short = formatIskCompact(value);

  async function copy() {
    try {
      await writeToClipboard(full);
    } catch {
      return;
    }
    flash();
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('market.appraisal.copyTotal', {
          amount: t('common.iskExact', { amount: full }),
        })}
        className={`cursor-copy rounded-xs hover:underline ${interactiveClassName} ${focusRingClassName}`}
      >
        {/* Exception: the exact figure is printed beside the shorthand, so IskAmount's tooltip would repeat it. */}
        {t('market.appraisal.totalFull', { full, short })}
      </button>
      {/* Mounted only while showing, so a page of these isn't a page of
        empty live regions competing with its own status line. */}
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-text normal-case shadow-md"
        >
          {t('market.appraisal.copiedToClipboard')}
        </span>
      )}
    </span>
  );
}
