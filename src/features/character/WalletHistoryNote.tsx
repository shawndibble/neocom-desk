import { useTranslation } from 'react-i18next';
import type { WalletArchiveInfo } from '@/features/character/walletArchive';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';

export function WalletHistoryNote({ info }: { info: WalletArchiveInfo | undefined }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const day = (ms: number) => formatDateOnly(new Date(ms), timeZone);
  if (!info || (info.since === null && !info.unconfirmed)) return null;
  return (
    <div className="px-3 pt-2 text-[0.6875rem] text-text-dim">
      <p>
        {info.since === null
          ? t('wallet.history.unconfirmed')
          : t('wallet.history.since', { date: day(info.since) })}
      </p>
      {info.gaps.length > 0 && (
        <p className="text-warning">
          {t('wallet.history.gap', {
            ranges: info.gaps.map(([from, to]) =>
              t('wallet.history.gapRange', { from: day(from), to: day(to) })
            ),
          })}
        </p>
      )}
    </div>
  );
}
