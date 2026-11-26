import { LiveNote } from '@/components/ui/LiveStatus';
import { useTranslation } from 'react-i18next';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';

const COPIED_FEEDBACK_MS = 2000;

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
        {t('market.appraisal.totalFull', { full, short })}
      </button>
      {copied && (
        <LiveNote
          as="span"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-text normal-case shadow-md"
        >
          {t('market.appraisal.copiedToClipboard')}
        </LiveNote>
      )}
    </span>
  );
}
