import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { netToneClass } from '@/features/character/format';
import type { JournalBreakdown } from '@/features/character/walletJournalFilter';
import { signedIsk } from '@/lib/signedIsk';
import { formatIsk } from '@/lib/isk';

interface JournalSummaryRowProps {
  totals: JournalBreakdown;
  entryCount: number;
  showInternal: boolean;
  sortControl?: ReactNode;
}

export function JournalSummaryRow({
  totals,
  entryCount,
  showInternal,
  sortControl,
}: JournalSummaryRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-xs tabular-nums">
        <span className="text-text-dim">
          {t('wallet.journalEntryCount', { count: entryCount })}
        </span>
        <span>
          {t('wallet.journalBreakdownIn')}{' '}
          <span className="text-isk-pos">{formatIsk(totals.totalIn)}</span>
        </span>
        <span>
          {t('wallet.journalBreakdownOut')}{' '}
          <span className="text-isk-neg">{formatIsk(totals.totalOut)}</span>
        </span>
        <span>
          {t('wallet.journalBreakdownNet')}{' '}
          <span className={netToneClass(totals.net)}>{signedIsk(totals.net, 0)}</span>
        </span>
        {showInternal && totals.internalCount > 0 && (
          <span className="text-text-dim">
            {t('wallet.journalLeftOut', { count: totals.internalCount })}
          </span>
        )}
      </div>
      {sortControl}
    </div>
  );
}
