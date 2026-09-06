import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  ReauthBanner,
  SearchInput,
  Spinner,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadContracts } from '@/features/character/contracts';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { IssuerLink } from '@/features/character/IssuerLink';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import {
  activeContractsFilterCount,
  contractStatusOptions,
  contractTypeOptions,
  filterContracts,
  EMPTY_CONTRACTS_FILTER,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
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

/** Rows shown before "show all" (same precedent as the market order book). */
const ROW_CAP = 50;

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

interface ContractsFilterBarProps {
  filter: ContractsFilter;
  onChange: (filter: ContractsFilter) => void;
  statusOptions: Contract['status'][];
  typeOptions: Contract['type'][];
}

/** Search plus status/type filter chips above the contracts table (issue #417). */
function ContractsFilterBar({
  filter,
  onChange,
  statusOptions,
  typeOptions,
}: ContractsFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeContractsFilterCount(filter)}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('contracts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <div
            role="group"
            aria-label={t('contracts.statusFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {statusOptions.map((status) => (
              <FilterChip
                key={status}
                label={t(CONTRACT_STATUS_KEY[status])}
                selected={draft.status === status}
                onToggle={() =>
                  setDraft({ ...draft, status: draft.status === status ? null : status })
                }
              />
            ))}
          </div>
          <div
            role="group"
            aria-label={t('contracts.typeFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {typeOptions.map((type) => (
              <FilterChip
                key={type}
                label={t(CONTRACT_TYPE_KEY[type])}
                selected={draft.type === type}
                onToggle={() => setDraft({ ...draft, type: draft.type === type ? null : type })}
              />
            ))}
          </div>
        </>
      )}
    </FilterBar>
  );
}

/** Contracts: table with status chips, stale offers dimmed, detail on click. Read-only, cached for offline. */
export function Contracts() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContractsSnapshot,
    undefined,
    { cacheKey: 'contracts' }
  );

  const contractsResult = data?.contractsResult ?? null;
  const contractsNeedsReauth = data?.contractsNeedsReauth ?? false;
  const contractsTruncated = data?.contractsTruncated ?? false;
  const issuerNames = data?.issuerNames ?? NO_NAMES;

  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [filter, setFilter] = useState<ContractsFilter>(EMPTY_CONTRACTS_FILTER);
  const [showAll, setShowAll] = useState(false);

  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        sortValue: (contract) => contract.title || t(CONTRACT_TYPE_KEY[contract.type]),
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
        sortValue: (contract) => t(CONTRACT_STATUS_KEY[contract.status]),
        render: (contract) => {
          const label = t(CONTRACT_STATUS_KEY[contract.status]);
          return isStale(contract) ? (
            <Tooltip content={t('contracts.staleTooltip')} openOnTap>
              <span>{label}</span>
            </Tooltip>
          ) : (
            label
          );
        },
      },
      {
        id: 'issuer',
        header: t('contracts.issuer'),
        sortValue: (contract) => issuerNames.get(contract.issuer_id) ?? `#${contract.issuer_id}`,
        render: (contract) => (
          <IssuerLink
            issuerId={contract.issuer_id}
            name={issuerNames.get(contract.issuer_id) ?? `#${contract.issuer_id}`}
            className="text-left"
          />
        ),
      },
      {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (contract) => contract.price ?? contract.reward,
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
        sortValue: (contract) => new Date(contract.date_expired).getTime(),
        render: (contract) => formatTimestamp(new Date(contract.date_expired)),
      },
    ],
    [t, issuerNames]
  );

  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
  );

  const statusOptions = useMemo(() => contractStatusOptions(contracts), [contracts]);
  const typeOptions = useMemo(() => contractTypeOptions(contracts), [contracts]);
  const filteredContracts = useMemo(
    () => filterContracts(contracts, filter, issuerNames),
    [contracts, filter, issuerNames]
  );
  const visibleContracts = showAll ? filteredContracts : filteredContracts.slice(0, ROW_CAP);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('contracts.title')}
        meta={contractsResult && <DataAgeBadge date={contractsResult.fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Download />}
              label={t('contracts.exportCsv')}
              disabled={filteredContracts.length === 0}
              onClick={() =>
                downloadCsv(
                  'contracts',
                  filteredContracts,
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
          </>
        }
      />

      {loading && !data ? (
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
            <p className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              <span>{t('common.incompleteTitle')}</span>
              <Button size="sm" disabled={loading} onClick={refresh}>
                {t('contracts.fetchTruncatedRetry')}
              </Button>
            </p>
          )}
          <ContractsFilterBar
            filter={filter}
            onChange={setFilter}
            statusOptions={statusOptions}
            typeOptions={typeOptions}
          />
          {filteredContracts.length === 0 ? (
            <EmptyState title={t('contracts.noFilterMatches')} className="py-8" />
          ) : (
            <>
              <DataTable
                label={t('contracts.title')}
                columns={columns}
                rows={visibleContracts}
                rowKey={(contract) => contract.contract_id}
                rowClassName={(contract) => (isStale(contract) ? 'opacity-50' : undefined)}
              />
              {!showAll && filteredContracts.length > ROW_CAP && (
                <div className="px-3 py-2">
                  <Button size="sm" onClick={() => setShowAll(true)}>
                    {t('contracts.showAll', { count: filteredContracts.length })}
                  </Button>
                </div>
              )}
            </>
          )}
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
