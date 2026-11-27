import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CachedEmptyState,
  CachedNotice,
  DataAgeBadge,
  LoadFailedState,
  Panel,
  Spinner,
  IncompleteNotice,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { cx } from '@/lib/cx';
import { GrantBanner } from '@/app/GrantNote';
import { JournalTable } from '@/features/character/WalletJournalTable';
import { WalletHistoryNote } from '@/features/character/WalletHistoryNote';
import type { WalletArchiveInfo } from '@/features/character/walletArchive';
import type { AllJournalsSnapshot } from '@/features/character/walletJournalAll';
import type { JournalRow } from '@/engine/journalNetting';
import type { CachedResult } from '@/esi/cache';
import type { WalletJournalEntry } from '@/esi/endpoints';

interface WalletJournalPanelProps {
  activeCharacterId: number;
  showingBeyondActive: boolean;
  iskPanelOpen: boolean;
  refreshCount: number;
  archive: WalletArchiveInfo | undefined;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journalNeedsReauth: boolean;
  journalLength: number;
  allJournalsData: AllJournalsSnapshot | null;
  allJournalsLoading: boolean;
  hasJournalSelection: boolean;
  onRetryAllJournals: () => void;
  onRetryJournal: () => void;
  journalFetchedAt: Date | null;
  journalExport: UseTableExport<JournalRow>;
  journalIsTruncated: boolean;
  itemNamesTruncated: boolean;
  table: Omit<ComponentProps<typeof JournalTable>, 'label' | 'panel' | 'tableExport'>;
  onIskPanelOpenChange: (open: boolean) => void;
  scopeLabel: string;
  coverage: NonNullable<ComponentProps<typeof JournalTable>['panel']>['coverage'];
}

export function WalletJournalPanel({
  activeCharacterId,
  showingBeyondActive,
  iskPanelOpen,
  refreshCount,
  archive,
  journalResult,
  journalNeedsReauth,
  journalLength,
  allJournalsData,
  allJournalsLoading,
  hasJournalSelection,
  onRetryAllJournals,
  onRetryJournal,
  journalFetchedAt,
  journalExport,
  journalIsTruncated,
  itemNamesTruncated,
  table,
  onIskPanelOpenChange,
  scopeLabel,
  coverage,
}: WalletJournalPanelProps) {
  const { t } = useTranslation();
  return (
    <Panel
      padded={false}
      title={t('wallet.journalTab')}
      actions={
        <span className="flex items-center gap-2">
          <Link
            to="/market/history"
            className={cx(
              'inline-flex min-h-9 min-w-9 items-center justify-center text-xs md:min-h-0 md:min-w-0',
              inlineLinkClassName
            )}
          >
            {t('wallet.transactionsLink')}
          </Link>
          {journalFetchedAt && (
            <>
              <TableActionsMenu name={t('wallet.journalTab')} tableExport={journalExport} />
              <DataAgeBadge date={journalFetchedAt} />
            </>
          )}
        </span>
      }
    >
      {showingBeyondActive && !allJournalsData ? (
        allJournalsLoading || !hasJournalSelection ? (
          <Spinner block="panel" label={t('common.loading')} />
        ) : (
          <LoadFailedState onRetry={onRetryAllJournals} className="py-8" />
        )
      ) : !showingBeyondActive && journalNeedsReauth ? (
        <div className="p-3">
          <GrantBanner characterId={activeCharacterId} endpoints={['getCharacterWalletJournal']} />
        </div>
      ) : !showingBeyondActive && !journalResult ? (
        <LoadFailedState onRetry={onRetryJournal} className="py-8" />
      ) : !showingBeyondActive && journalLength === 0 ? (
        <CachedEmptyState
          result={journalResult}
          title={t('wallet.journalEmptyTitle')}
          hint={t('wallet.journalEmptyHint')}
          fetchedTitle={t('wallet.journalEmptyFetchedTitle')}
          fetchedHint={t('wallet.journalEmptyFetchedHint')}
          className="py-8"
        />
      ) : (
        <>
          {!showingBeyondActive && journalResult?.fromCache && (
            <CachedNotice
              withBadge
              className="px-3 pt-2"
              fetchedAt={journalResult.fetchedAt}
              refreshFailed={refreshCount > 0}
            />
          )}
          {journalIsTruncated && (
            <IncompleteNotice className="px-3 pt-2" hint={t('wallet.journalTruncatedHint')} />
          )}
          {itemNamesTruncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
              {t('wallet.journalItemNamesCappedHint')}
            </p>
          )}
          <WalletHistoryNote info={archive} />
          <JournalTable
            {...table}
            label={t('wallet.journalTab')}
            tableExport={journalExport}
            panel={{
              open: iskPanelOpen,
              onOpenChange: onIskPanelOpenChange,
              scopeLabel,
              coverage,
            }}
          />
        </>
      )}
    </Panel>
  );
}
