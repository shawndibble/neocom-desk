import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import {
  loadWalletBalanceWithStatus,
  loadWalletJournal,
  loadWalletTransactions,
} from '@/features/character/wallet';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { humanizeRefType, iskToneClass } from '@/features/character/format';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/features/character/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';

/** Stable identity, so the fallback doesn't invalidate the column memos every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  balanceResult: CachedResult<number> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  balanceNeedsReauth: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  journalTruncated: boolean;
  transactionsResult: CachedResult<WalletTransaction[]> | null;
  /** The fetch stopped at the transactions page cap; older history is missing. */
  transactionsTruncated: boolean;
  typeNames: Map<number, string>;
}

/** Buys are money out, so the signed total is what carries the ISK tone. */
function transactionTotal(txn: WalletTransaction): number {
  return txn.unit_price * txn.quantity * (txn.is_buy ? -1 : 1);
}

async function loadWalletSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [balanceStatus, journalResult, transactionsResult] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadWalletJournal(characterId),
    loadWalletTransactions(characterId),
  ]);
  const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
  const journalTruncated = journalResult?.truncated ?? false;
  const transactionsTruncated = transactionsResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const typeIds = signal.cancelled
    ? []
    : [...new Set((transactionsResult?.data ?? []).map((txn) => txn.type_id))];
  const typeNames = await loadTypeNames(typeIds);
  return {
    balanceResult,
    balanceNeedsReauth,
    journalResult,
    journalTruncated,
    transactionsResult,
    transactionsTruncated,
    typeNames,
  };
}

/** Wallet: ISK balance, journal, and recent transactions. Read-only, cached for offline. */
export function Wallet() {
  const { t } = useTranslation();
  const { data, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadWalletSnapshot);

  const [tab, setTab] = useState<'balance' | 'journal' | 'transactions'>('balance');

  // A manual Refresh that still falls back to cache is a more alarming case
  // than the initial load finding cache first — same banner, different copy.
  const offlineTitleKey = refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle';

  const balanceResult = data?.balanceResult ?? null;
  const balanceNeedsReauth = data?.balanceNeedsReauth ?? false;
  const journalResult = data?.journalResult ?? null;
  const journalTruncated = data?.journalTruncated ?? false;
  const transactionsResult = data?.transactionsResult ?? null;
  const transactionsTruncated = data?.transactionsTruncated ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;

  const journalColumns = useMemo<DataTableColumn<WalletJournalEntry>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (entry) => new Date(entry.date).toLocaleString(),
      },
      {
        id: 'refType',
        header: t('wallet.refType'),
        className: 'whitespace-nowrap',
        render: (entry) => humanizeRefType(entry.ref_type),
      },
      {
        id: 'description',
        header: t('wallet.description'),
        render: (entry) => entry.description,
      },
      {
        id: 'amount',
        header: t('wallet.amount'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (entry) => (entry.amount !== undefined ? iskToneClass(entry.amount) : ''),
        render: (entry) =>
          entry.amount !== undefined ? formatIsk(entry.amount, 2) : t('common.unknown'),
      },
      {
        id: 'balance',
        header: t('wallet.balanceCol'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        render: (entry) =>
          entry.balance !== undefined ? formatIsk(entry.balance, 2) : t('common.unknown'),
      },
    ],
    [t]
  );

  const transactionColumns = useMemo<DataTableColumn<WalletTransaction>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (txn) => new Date(txn.date).toLocaleString(),
      },
      {
        id: 'item',
        header: t('wallet.item'),
        render: (txn) => typeNames.get(txn.type_id) ?? `Type #${txn.type_id}`,
      },
      {
        id: 'side',
        header: t('wallet.side'),
        render: (txn) => (txn.is_buy ? t('wallet.buy') : t('wallet.sell')),
      },
      {
        id: 'quantity',
        header: t('wallet.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => txn.quantity.toLocaleString(),
      },
      {
        id: 'unitPrice',
        header: t('wallet.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => formatIsk(txn.unit_price, 2),
      },
      {
        id: 'total',
        header: t('wallet.total'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
        render: (txn) => formatIsk(transactionTotal(txn), 2),
      },
    ],
    [t, typeNames]
  );

  const journal = useMemo(
    () => [...(journalResult?.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [journalResult]
  );
  const transactions = useMemo(
    () => [...(transactionsResult?.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [transactionsResult]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('wallet.title')}</h1>
        <Button size="sm" onClick={refresh} disabled={loading}>
          {t('wallet.refresh')}
        </Button>
      </header>

      <Tabs
        label={t('wallet.title')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'balance', label: t('wallet.balanceTab') },
          { id: 'journal', label: t('wallet.journalTab') },
          { id: 'transactions', label: t('wallet.transactionsTab') },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : tab === 'balance' ? (
        <Panel
          title={t('wallet.balanceTab')}
          actions={balanceResult ? <DataAgeBadge date={balanceResult.fetchedAt} /> : undefined}
        >
          {balanceNeedsReauth ? (
            <ReauthBanner
              title={t('wallet.reauthTitle')}
              hint={t('wallet.reauthHint')}
              actionLabel={t('wallet.reauthAction')}
              onLogin={() => void beginEveLogin()}
            />
          ) : balanceResult ? (
            <>
              <p className={`text-lg font-medium tabular-nums ${iskToneClass(balanceResult.data)}`}>
                {formatIsk(balanceResult.data, 2)} {t('wallet.isk')}
              </p>
              {balanceResult.fromCache && (
                <p className="mt-1 text-[0.6875rem] text-warning uppercase">{t(offlineTitleKey)}</p>
              )}
            </>
          ) : (
            <EmptyState title={t('wallet.balanceEmpty')} className="py-4" />
          )}
        </Panel>
      ) : tab === 'journal' ? (
        <Panel
          padded={false}
          title={t('wallet.journalTab')}
          actions={journalResult ? <DataAgeBadge date={journalResult.fetchedAt} /> : undefined}
        >
          {!journalResult || journal.length === 0 ? (
            <EmptyState
              title={t('wallet.journalEmptyTitle')}
              hint={t('wallet.journalEmptyHint')}
              className="py-8"
            />
          ) : (
            <>
              {journalResult.fromCache && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t(offlineTitleKey)}
                </p>
              )}
              {journalTruncated && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('common.incompleteTitle')}
                </p>
              )}
              <DataTable
                label={t('wallet.journalTab')}
                columns={journalColumns}
                rows={journal}
                rowKey={(entry) => entry.id}
              />
            </>
          )}
        </Panel>
      ) : (
        <Panel
          padded={false}
          title={t('wallet.transactionsTab')}
          actions={
            transactionsResult ? <DataAgeBadge date={transactionsResult.fetchedAt} /> : undefined
          }
        >
          {!transactionsResult || transactions.length === 0 ? (
            <EmptyState
              title={t('wallet.transactionsEmptyTitle')}
              hint={t('wallet.transactionsEmptyHint')}
              className="py-8"
            />
          ) : (
            <>
              {transactionsResult.fromCache && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t(offlineTitleKey)}
                </p>
              )}
              {transactionsTruncated && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('wallet.transactionsCapped')}
                </p>
              )}
              <DataTable
                label={t('wallet.transactionsTab')}
                columns={transactionColumns}
                rows={transactions}
                rowKey={(txn) => txn.transaction_id}
              />
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
