import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CachedEmptyState,
  CachedNotice,
  DataAgeBadge,
  LoadFailedState,
  Panel,
  Spinner,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { cx } from '@/lib/cx';
import { GrantBanner } from '@/app/GrantNote';
import { WalletOriginCrumb } from '@/features/character/WalletOriginCrumb';
import { JournalTable } from '@/features/character/WalletJournalTable';
import { WalletHistoryNote } from '@/features/character/WalletHistoryNote';
import type { WalletArchiveInfo } from '@/features/character/walletArchive';
import type { AllJournalsSnapshot } from '@/features/character/walletJournalAll';
import type { JournalRow } from '@/engine/journalNetting';
import type { CachedResult } from '@/esi/cache';
import type { WalletJournalEntry } from '@/esi/endpoints';

interface WalletJournalPanelProps {
  activeCharacterId: number;
  /** The Journal tab covers more than the active Character. */
  showingBeyondActive: boolean;
  iskPanelOpen: boolean;
  filterMeta: ReactNode;
  refreshCount: number;
  archive: WalletArchiveInfo | undefined;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journalNeedsReauth: boolean;
  /** The active Character's own journal rows (empty = nothing to list). */
  journalLength: number;
  /** The fan-out journals, once loaded; null while loading or failed. */
  allJournalsData: AllJournalsSnapshot | null;
  allJournalsLoading: boolean;
  /** Null when the multi view has no Characters picked, so nothing is loading. */
  hasJournalSelection: boolean;
  onRetryAllJournals: () => void;
  journalFetchedAt: Date | null;
  journalExport: UseTableExport<JournalRow>;
  journalIsTruncated: boolean;
  itemNamesTruncated: boolean;
  table: Omit<ComponentProps<typeof JournalTable>, 'label' | 'panel' | 'tableExport'>;
  onIskPanelOpenChange: (open: boolean) => void;
  scopeLabel: string;
  coverage: NonNullable<ComponentProps<typeof JournalTable>['panel']>['coverage'];
}

/** The Journal tab: a Character's (or several Characters') wallet journal and its filters. */
export function WalletJournalPanel({
  activeCharacterId,
  showingBeyondActive,
  iskPanelOpen,
  filterMeta,
  refreshCount,
  archive,
  journalResult,
  journalNeedsReauth,
  journalLength,
  allJournalsData,
  allJournalsLoading,
  hasJournalSelection,
  onRetryAllJournals,
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
      wrapMeta
      // Beside the open panel the page is narrow at any viewport, so the
      // Character filter drops under the title instead of crowding the actions.
      className={iskPanelOpen ? '[&>header>div:first-child]:flex-wrap' : undefined}
      meta={
        <span
          className={cx(
            'flex flex-wrap items-center gap-2 max-md:basis-full',
            iskPanelOpen && 'md:basis-full'
          )}
        >
          <WalletOriginCrumb />
          {filterMeta}
        </span>
      }
      actions={
        <span className="flex items-center gap-2">
          <Link
            to="/market/history"
            className={cx(
              'inline-flex min-h-11 min-w-11 items-center justify-center text-xs md:min-h-0 md:min-w-0',
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
          <div className="flex justify-center py-8">
            <Spinner label={t('common.loading')} />
          </div>
        ) : (
          <LoadFailedState onRetry={onRetryAllJournals} className="py-8" />
        )
      ) : !showingBeyondActive && journalNeedsReauth ? (
        <div className="p-3">
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterWalletJournal']}
            title={t('wallet.reauthTitle')}
            hint={t('wallet.reauthHint')}
            actionLabel={t('wallet.reauthAction')}
          />
        </div>
      ) : !showingBeyondActive && (!journalResult || journalLength === 0) ? (
        <CachedEmptyState
          result={journalResult}
          title={t('wallet.journalEmptyTitle')}
          hint={t('wallet.journalEmptyHint')}
          fetchedTitle={t('wallet.journalEmptyFetchedTitle')}
          className="py-8"
        />
      ) : (
        <>
          {!showingBeyondActive && journalResult?.fromCache && (
            <CachedNotice
              className="px-3 pt-2"
              fetchedAt={journalResult.fetchedAt}
              refreshFailed={refreshCount > 0}
            />
          )}
          {journalIsTruncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} — {t('wallet.journalTruncatedHint')}
            </p>
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
