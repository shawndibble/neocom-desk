import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';

/** What a Payee was already sent that nothing here accounts for yet (`unlinkedSentFor`). */
export interface UnlinkedSent {
  count: number;
  amount: number;
}

/**
 * "You already sent this, link it first, or the figure bills you twice": the Payee card and
 * Settle up say it in the same words, since both show the same overstated owed figure.
 */
export function UnlinkedSentNote({ unlinked }: { unlinked: UnlinkedSent }) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-warning">
      {t('miningTax.owed.unlinkedNote', {
        count: unlinked.count,
        amount: formatIsk(unlinked.amount, 0),
      })}
    </p>
  );
}
