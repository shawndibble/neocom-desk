import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { loadContracts } from '@/features/character/contracts';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import type { Contract } from '@/esi/endpoints';

interface Snapshot {
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

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

function isExpired(contract: Contract): boolean {
  return new Date(contract.date_expired).getTime() < Date.now();
}

async function loadContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const contractsResult = await loadContracts(characterId);
  // Already superseded: skip the name lookup, its result would be discarded.
  const issuerIds = signal.cancelled ? [] : (contractsResult?.data ?? []).map((c) => c.issuer_id);
  const issuerNames = await resolveNames(issuerIds);
  return { contractsResult, issuerNames };
}

/** Contracts: table with status chips, expired dimmed. Read-only, cached for offline. */
export function Contracts() {
  const { t } = useTranslation();
  const { data, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadContractsSnapshot);

  const contractsResult = data?.contractsResult ?? null;
  const issuerNames = data?.issuerNames ?? NO_NAMES;

  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        render: (contract) => contract.title || contract.type,
      },
      {
        id: 'status',
        header: t('contracts.status'),
        className: 'font-semibold',
        cellClassName: (contract) => STATUS_TONE[contract.status],
        render: (contract) => contract.status,
      },
      {
        id: 'issuer',
        header: t('contracts.issuer'),
        render: (contract) => issuerNames.get(contract.issuer_id) ?? `#${contract.issuer_id}`,
      },
      {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        className: 'tabular-nums',
        render: (contract) =>
          contract.price !== undefined
            ? formatIsk(contract.price, 2)
            : contract.reward !== undefined
              ? formatIsk(contract.reward, 2)
              : t('common.unknown'),
      },
      {
        id: 'expires',
        header: t('contracts.expires'),
        className: 'whitespace-nowrap text-text-dim',
        render: (contract) => new Date(contract.date_expired).toLocaleString(),
      },
    ],
    [t, issuerNames]
  );

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
          <Button size="sm" onClick={refresh} disabled={loading}>
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
          <DataTable
            label={t('contracts.title')}
            columns={columns}
            rows={contracts}
            rowKey={(contract) => contract.contract_id}
            rowClassName={(contract) => (isExpired(contract) ? 'opacity-50' : undefined)}
          />
        </Panel>
      )}
    </div>
  );
}
