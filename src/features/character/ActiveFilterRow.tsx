/**
 * The Journal's active-filter row (issue #3908): each active filter as a
 * removable chip, then the filtered entry count with its In / Out / Net, then
 * how many lines between the pilot's own Characters were left out.
 */
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/ui';
import { iskToneClass } from '@/features/character/format';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import type {
  JournalBreakdown,
  WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { signedIsk } from '@/features/market/signedIsk';
import { clampIskZero, formatIsk } from '@/lib/isk';

interface ActiveFilterRowProps {
  filter: WalletJournalFilter;
  onChange: (filter: WalletJournalFilter) => void;
  /** The filtered rows' totals. */
  totals: JournalBreakdown;
  entryCount: number;
  /** Personal journal only: the corp journal nets nothing and says nothing of it. */
  showInternal: boolean;
}

export function ActiveFilterRow({
  filter,
  onChange,
  totals,
  entryCount,
  showInternal,
}: ActiveFilterRowProps) {
  const { t } = useTranslation();
  const chips: { key: string; label: string; clear: Partial<WalletJournalFilter> }[] = [];
  if (filter.refType !== null)
    chips.push({
      key: 'type',
      label: t('wallet.journalChipType', { type: journalRefLabel(filter.refType, t) }),
      clear: { refType: null },
    });
  if (filter.startDate !== null)
    chips.push({
      key: 'from',
      label: t('wallet.journalChipFrom', { date: filter.startDate }),
      clear: { startDate: null },
    });
  if (filter.endDate !== null)
    chips.push({
      key: 'to',
      label: t('wallet.journalChipTo', { date: filter.endDate }),
      clear: { endDate: null },
    });
  const netTone = clampIskZero(totals.net, 0) === 0 ? '' : iskToneClass(totals.net);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs tabular-nums">
      {chips.map((chip) => (
        <FilterChip
          key={chip.key}
          label={`${chip.label} ×`}
          selected
          onToggle={() => onChange({ ...filter, ...chip.clear })}
          tooltip={t('wallet.journalChipRemove')}
        />
      ))}
      <span className="text-text-dim">{t('wallet.journalEntryCount', { count: entryCount })}</span>
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
        <span className={netTone}>{signedIsk(totals.net, 0)}</span>
      </span>
      {showInternal && totals.internalCount > 0 && (
        <span className="text-text-dim">
          {t('wallet.journalLeftOut', { count: totals.internalCount })}
        </span>
      )}
    </div>
  );
}
