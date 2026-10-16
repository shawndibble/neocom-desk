import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { WalletArchiveInfo } from '@/features/character/walletArchive';
import type { WalletJournalFilter } from '@/features/character/walletJournalFilter';

const DAY_MS = 86_400_000;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The Journal's archive line (issue #3909): how far back the device holds
 * history, any stretch it never saw, and 90-day / 1-year range shortcuts once
 * the archive reaches that far. Renders nothing before the first full fetch.
 */
export function WalletHistoryNote({
  info,
  filter,
  onFilterChange,
  nowMs,
}: {
  info: WalletArchiveInfo | undefined;
  filter: WalletJournalFilter;
  onFilterChange: (next: WalletJournalFilter) => void;
  nowMs?: number;
}) {
  const { t } = useTranslation();
  const [now] = useState(() => nowMs ?? Date.now());
  if (!info || info.since === null) return null;
  return (
    <div className="px-3 pt-2 text-[0.6875rem] text-text-dim">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{t('wallet.history.since', { date: isoDay(info.since) })}</span>
        {info.ranges.map((days) => {
          const startDate = isoDay(now - days * DAY_MS);
          const active = filter.startDate === startDate && filter.endDate === null;
          return (
            <Button
              key={days}
              size="sm"
              variant={active ? 'accent' : 'ghost'}
              aria-pressed={active}
              onClick={() => onFilterChange({ ...filter, startDate, endDate: null })}
            >
              {t(days === 365 ? 'wallet.history.range1y' : 'wallet.history.rangeDays', { days })}
            </Button>
          );
        })}
      </p>
      {info.gaps.length > 0 && (
        <p className="text-warning">
          {t('wallet.history.gap', {
            ranges: info.gaps.map(([from, to]) => `${isoDay(from)} – ${isoDay(to)}`).join(', '),
          })}
        </p>
      )}
    </div>
  );
}
