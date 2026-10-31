/**
 * The Journal's active-filter row (issue #3908): each active filter as a
 * selected chip that a click turns off, then the filtered entry count with its In / Out / Net, then
 * how many lines between the pilot's own Characters were left out.
 */
import type { ReactNode } from 'react';
import { formatIsoDay } from '@/lib/formatDateTick';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/ui';
import { netToneClass } from '@/features/character/format';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import type {
  JournalBreakdown,
  WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { signedIsk } from '@/lib/signedIsk';
import { formatIsk } from '@/lib/isk';

interface ActiveFilterRowProps {
  filter: WalletJournalFilter;
  onChange: (filter: WalletJournalFilter) => void;
  /** The filtered rows' totals. */
  totals: JournalBreakdown;
  entryCount: number;
  /** Where own-Character lines are netted (personal only): the corp journal says nothing of it. */
  showInternal: boolean;
  /** Names a Journal Party id for its chip; absent on the corp journal, which has no party filter. */
  partyNameFor?: (id: number) => string;
  /** Sits at the row's right end, level with the stats (the phone's sort icon). */
  sortControl?: ReactNode;
}

export function ActiveFilterRow({
  filter,
  onChange,
  totals,
  entryCount,
  showInternal,
  partyNameFor,
  sortControl,
}: ActiveFilterRowProps) {
  const { t } = useTranslation();
  const chips: { key: string; label: string; clear: Partial<WalletJournalFilter> }[] = [];
  if (filter.refType !== null)
    chips.push({
      key: 'type',
      label: t('wallet.journalChipType', { type: journalRefLabel(filter.refType, t) }),
      clear: { refType: null },
    });
  if (filter.party !== null)
    chips.push({
      key: 'party',
      label: t('wallet.journalChipParty', {
        party: partyNameFor?.(Number(filter.party)) ?? `#${filter.party}`,
      }),
      clear: { party: null },
    });
  if (filter.startDate !== null && filter.startDate === filter.endDate)
    chips.push({
      key: 'day',
      label: t('wallet.journalChipDay', { date: formatIsoDay(filter.startDate) }),
      clear: { startDate: null, endDate: null },
    });
  else {
    if (filter.startDate !== null)
      chips.push({
        key: 'from',
        label: t('wallet.journalChipFrom', { date: formatIsoDay(filter.startDate) }),
        clear: { startDate: null },
      });
    if (filter.endDate !== null)
      chips.push({
        key: 'to',
        label: t('wallet.journalChipTo', { date: formatIsoDay(filter.endDate) }),
        clear: { endDate: null },
      });
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-xs tabular-nums">
        {chips.map((chip) => (
          <FilterChip
            key={chip.key}
            label={chip.label}
            selected
            onToggle={() => onChange({ ...filter, ...chip.clear })}
            tooltip={t('wallet.journalChipRemove')}
          />
        ))}
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
