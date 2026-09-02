import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  type DataTableColumn,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadContracts } from '@/features/character/contracts';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import type { Contract } from '@/esi/endpoints';

interface Snapshot {
  contractsResult: CachedResult<Contract[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contractsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contractsTruncated: boolean;
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

/**
 * Lapsed and unclaimed — still `outstanding` past its accept-by deadline.
 * `date_expired` is only ever "the deadline to act", not "when this row
 * stopped mattering": a finished/cancelled/etc. contract's deadline is
 * naturally in the past for anything old, so dimming on date alone (the
 * previous behavior) faded almost every completed contract in the list.
 */
function isStale(contract: Contract): boolean {
  return (
    contract.status === 'outstanding' && new Date(contract.date_expired).getTime() < Date.now()
  );
}

async function loadContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: contractsResult, needsReauth: contractsNeedsReauth } =
    await loadContracts(characterId);
  const contractsTruncated = contractsResult?.truncated ?? false;
  // Already superseded: skip the name lookup, its result would be discarded.
  const issuerIds = signal.cancelled ? [] : (contractsResult?.data ?? []).map((c) => c.issuer_id);
  const issuerNames = await resolveNames(issuerIds);
  return { contractsResult, contractsNeedsReauth, contractsTruncated, issuerNames };
}

/** Contracts: table with status chips, stale offers dimmed, detail on click. Read-only, cached for offline. */
export function Contracts() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadContractsSnapshot);

  const contractsResult = data?.contractsResult ?? null;
  const contractsNeedsReauth = data?.contractsNeedsReauth ?? false;
  const contractsTruncated = data?.contractsTruncated ?? false;
  const issuerNames = data?.issuerNames ?? NO_NAMES;

  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        render: (contract) => (
          <button
            type="button"
            onClick={() => setSelectedContract(contract)}
            className="text-left font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {contract.title || t(CONTRACT_TYPE_KEY[contract.type])}
          </button>
        ),
      },
      {
        id: 'status',
        header: t('contracts.status'),
        className: 'font-semibold',
        cellClassName: (contract) => STATUS_TONE[contract.status],
        render: (contract) => t(CONTRACT_STATUS_KEY[contract.status]),
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
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('contracts.title')}</h1>
        <div className="flex items-center gap-2">
          {contractsResult && <DataAgeBadge date={contractsResult.fetchedAt} />}
          <IconButton
            icon={<Icon.Download />}
            label={t('contracts.exportCsv')}
            disabled={contracts.length === 0}
            onClick={() =>
              downloadCsv(
                'contracts',
                contracts,
                contractsCsvColumns(t, (id) => issuerNames.get(id) ?? `#${id}`),
                new Date(),
                contractsTruncated
              )
            }
          />
          <IconButton
            icon={<Icon.Refresh />}
            label={t('contracts.refresh')}
            onClick={refresh}
            disabled={loading}
          />
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : contractsNeedsReauth ? (
        <ReauthBanner
          title={t('contracts.reauthTitle')}
          hint={t('contracts.reauthHint')}
          actionLabel={t('contracts.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !contractsResult || contracts.length === 0 ? (
        <EmptyState title={t('contracts.emptyTitle')} hint={t('contracts.emptyHint')} />
      ) : (
        <Panel padded={false}>
          {contractsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          {contractsTruncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')}
            </p>
          )}
          <DataTable
            label={t('contracts.title')}
            columns={columns}
            rows={contracts}
            rowKey={(contract) => contract.contract_id}
            rowClassName={(contract) => (isStale(contract) ? 'opacity-50' : undefined)}
          />
        </Panel>
      )}

      {selectedContract && activeCharacterId !== null && (
        <ContractDetailModal
          characterId={activeCharacterId}
          contract={selectedContract}
          issuerName={
            issuerNames.get(selectedContract.issuer_id) ?? `#${selectedContract.issuer_id}`
          }
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}
