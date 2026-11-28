import { Toast } from '@/components/ui/Toast';
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
      {copied && <Toast message={t('market.appraisal.copiedToClipboard')} />}
    </span>
  );
}
