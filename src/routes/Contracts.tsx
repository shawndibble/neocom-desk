import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadContracts } from '@/features/character/contracts';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { formatIsk } from '@/lib/isk';
import type { Contract } from '@/esi/endpoints';

interface Snapshot {
  requestKey: string;
  contractsResult: CachedResult<Contract[]> | null;
  issuerNames: Map<number, string>;
}

const STATUS_TONE: Record<Contract['status'], string> = {
  outstanding: 'text-accent',
  in_progress: 'text-warning',
  finished_issuer: 'text-success',
  finished_contractor: 'text-success',
  finished: 'text-success',
  cancelled: 'text-text-faint',
  rejected: 'text-danger',
  failed: 'text-danger',
  deleted: 'text-text-faint',
  reversed: 'text-danger',
};

function isExpired(contract: Contract): boolean {
  return new Date(contract.date_expired).getTime() < Date.now();
}

/** Contracts: table with status chips, expired dimmed. Read-only, cached for offline. */
export function Contracts() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = `${activeCharacterId}:${refreshKey}`;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const contractsResult = await loadContracts(activeCharacterId);
      if (cancelled) return;
      const issuerIds = (contractsResult?.data ?? []).map((c) => c.issuer_id);
      const issuerNames = await resolveNames(issuerIds);
      if (cancelled) return;
      setSnapshot({ requestKey, contractsResult, issuerNames });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [activeCharacterId, refreshKey]);

  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const loading = current === null;
  const contractsResult = current?.contractsResult ?? null;
  const issuerNames = current?.issuerNames ?? new Map<number, string>();

  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
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
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('contracts.title')}</h1>
        <div className="flex items-center gap-2">
          {contractsResult && <DataAgeBadge date={contractsResult.fetchedAt} />}
          <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            {t('contracts.refresh')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !contractsResult || contracts.length === 0 ? (
        <EmptyState title={t('contracts.emptyTitle')} hint={t('contracts.emptyHint')} />
      ) : (
        <Panel padded={false}>
          {contractsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-text-dim">
                <th className="px-3 py-2 font-semibold uppercase">{t('contracts.type')}</th>
                <th className="px-3 py-2 font-semibold uppercase">{t('contracts.status')}</th>
                <th className="px-3 py-2 font-semibold uppercase">{t('contracts.issuer')}</th>
                <th className="px-3 py-2 text-right font-semibold uppercase">
                  {t('contracts.price')}
                </th>
                <th className="px-3 py-2 font-semibold uppercase">{t('contracts.expires')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contracts.map((contract) => (
                <tr
                  key={contract.contract_id}
                  className={isExpired(contract) ? 'opacity-50' : undefined}
                >
                  <td className="px-3 py-1.5">{contract.title || contract.type}</td>
                  <td className={`px-3 py-1.5 font-semibold ${STATUS_TONE[contract.status]}`}>
                    {contract.status}
                  </td>
                  <td className="px-3 py-1.5">
                    {issuerNames.get(contract.issuer_id) ?? `#${contract.issuer_id}`}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {contract.price !== undefined
                      ? formatIsk(contract.price, 2)
                      : contract.reward !== undefined
                        ? formatIsk(contract.reward, 2)
                        : t('common.unknown')}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-text-dim">
                    {new Date(contract.date_expired).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
