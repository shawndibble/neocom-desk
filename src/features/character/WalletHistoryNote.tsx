import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/ui/FilterChip';
import { utcDay } from '@/engine/netWorth/snapshot';
import { ARCHIVE_DAYS } from '@/engine/wallet/archiveCoverage';
import type { WalletArchiveInfo } from '@/features/character/walletArchive';
import type { WalletJournalFilter } from '@/features/character/walletJournalFilter';
import { DAY_MS } from '@/lib/age';

/**
 * The Journal's archive line: how far back the device holds history, any
 * stretch it never saw, and 90-day / 1-year range shortcuts once the archive
 * reaches that far. Renders nothing before the first stored row.
 */
export function WalletHistoryNote({
  info,
  filter,
  onFilterChange,
}: {
  info: WalletArchiveInfo | undefined;
  filter: WalletJournalFilter;
  onFilterChange: (next: WalletJournalFilter) => void;
}) {
  const { t, i18n } = useTranslation();
  // EVE days, written the way the journal's own dates are.
  const day = (ms: number) => new Date(ms).toLocaleDateString(i18n.language, { timeZone: 'UTC' });
  const [now] = useState(() => Date.now());
  if (!info || (info.since === null && !info.unconfirmed)) return null;
  return (
    <div className="px-3 pt-2 text-[0.6875rem] text-text-dim">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {info.since === null
            ? t('wallet.history.unconfirmed')
            : t('wallet.history.since', { date: day(info.since) })}
        </span>
        {info.ranges.map((days) => {
          const startDate = utcDay(now - days * DAY_MS);
          return (
            <FilterChip
              key={days}
              label={t(
                days === ARCHIVE_DAYS ? 'wallet.history.range1y' : 'wallet.history.rangeDays',
                {
                  days,
                }
              )}
              selected={filter.startDate === startDate && filter.endDate === null}
              onToggle={() => onFilterChange({ ...filter, startDate, endDate: null })}
            />
          );
        })}
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
