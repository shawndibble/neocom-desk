import { useTranslation } from 'react-i18next';
import type { WalletArchiveInfo } from '@/features/character/walletArchive';

/**
 * The Journal's archive line: how far back the device holds history, any
 * stretch it never saw. Range presets live in the Journal's Range select. Renders nothing before the first stored row.
 */
export function WalletHistoryNote({ info }: { info: WalletArchiveInfo | undefined }) {
  const { t, i18n } = useTranslation();
  // EVE days, written the way the journal's own dates are.
  const day = (ms: number) => new Date(ms).toLocaleDateString(i18n.language, { timeZone: 'UTC' });
  if (!info || (info.since === null && !info.unconfirmed)) return null;
  return (
    <div className="px-3 pt-2 text-[0.6875rem] text-text-dim">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {info.since === null
            ? t('wallet.history.unconfirmed')
            : t('wallet.history.since', { date: day(info.since) })}
        </span>
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
