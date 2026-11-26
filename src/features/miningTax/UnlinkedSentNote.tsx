import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';

export interface UnlinkedSent {
  count: number;
  amount: number;
}

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
