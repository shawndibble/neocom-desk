import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
} from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from '@/app/loginFlow';
import {
  loadWalletBalanceWithStatus,
  loadWalletJournal,
  loadWalletTransactions,
} from '@/features/character/wallet';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { humanizeRefType, iskToneClass } from '@/features/character/format';
import { formatIsk } from '@/lib/isk';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';

interface Snapshot {
  requestKey: string;
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

/** Wallet: ISK balance, journal, and recent transactions. Read-only, cached for offline. */
export function Wallet() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [tab, setTab] = useState<'balance' | 'journal' | 'transactions'>('balance');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = `${activeCharacterId}:${refreshKey}`;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [balanceStatus, journalResult, transactionsResult] = await Promise.all([
        loadWalletBalanceWithStatus(activeCharacterId),
        loadWalletJournal(activeCharacterId),
        loadWalletTransactions(activeCharacterId),
      ]);
      if (cancelled) return;
      const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
      const journalTruncated = journalResult?.truncated ?? false;
      const transactionsTruncated = transactionsResult?.truncated ?? false;
      const typeIds = [...new Set((transactionsResult?.data ?? []).map((t) => t.type_id))];
      const typeNames = await loadTypeNames(typeIds);
      if (cancelled) return;
      setSnapshot({
        requestKey,
        balanceResult,
        balanceNeedsReauth,
        journalResult,
        journalTruncated,
        transactionsResult,
        transactionsTruncated,
        typeNames,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [activeCharacterId, refreshKey]);

  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const loading = current === null;
  // A manual Refresh that still falls back to cache is a more alarming case
  // than the initial load finding cache first — same banner, different copy.
  const offlineTitleKey = refreshKey > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle';

  const balanceResult = current?.balanceResult ?? null;
  const balanceNeedsReauth = current?.balanceNeedsReauth ?? false;
  const journalResult = current?.journalResult ?? null;
  const journalTruncated = current?.journalTruncated ?? false;
  const transactionsResult = current?.transactionsResult ?? null;
  const transactionsTruncated = current?.transactionsTruncated ?? false;
  const typeNames = current?.typeNames ?? new Map<number, string>();

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
        <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-text-dim">
                    <th className="px-3 py-2 font-semibold uppercase">{t('wallet.date')}</th>
                    <th className="px-3 py-2 font-semibold uppercase">{t('wallet.refType')}</th>
                    <th className="px-3 py-2 font-semibold uppercase">{t('wallet.description')}</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase">
                      {t('wallet.amount')}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold uppercase">
                      {t('wallet.balanceCol')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {journal.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-1.5 whitespace-nowrap text-text-dim">
                        {new Date(entry.date).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {humanizeRefType(entry.ref_type)}
                      </td>
                      <td className="px-3 py-1.5">{entry.description}</td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums ${
                          entry.amount !== undefined ? iskToneClass(entry.amount) : ''
                        }`}
                      >
                        {entry.amount !== undefined
                          ? formatIsk(entry.amount, 2)
                          : t('common.unknown')}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-dim">
                        {entry.balance !== undefined
                          ? formatIsk(entry.balance, 2)
                          : t('common.unknown')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-text-dim">
                    <th className="px-3 py-2 font-semibold uppercase">{t('wallet.date')}</th>
                    <th className="px-3 py-2 font-semibold uppercase">{t('wallet.item')}</th>
                    <th className="px-3 py-2 font-semibold uppercase">{t('wallet.side')}</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase">
                      {t('wallet.quantity')}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold uppercase">
                      {t('wallet.unitPrice')}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold uppercase">
                      {t('wallet.total')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {transactions.map((txn) => {
                    const total = txn.unit_price * txn.quantity * (txn.is_buy ? -1 : 1);
                    return (
                      <tr key={txn.transaction_id}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-text-dim">
                          {new Date(txn.date).toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5">
                          {typeNames.get(txn.type_id) ?? `Type #${txn.type_id}`}
                        </td>
                        <td className="px-3 py-1.5">
                          {txn.is_buy ? t('wallet.buy') : t('wallet.sell')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {txn.quantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatIsk(txn.unit_price, 2)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums ${iskToneClass(total)}`}
                        >
                          {formatIsk(total, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
