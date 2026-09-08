import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterField,
  IconButton,
  PageHeader,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SearchInput,
  Spinner,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  EMPTY_BPC_SEARCH_FILTER,
  filterBpcContracts,
  listedBlueprintTypeOptions,
  type BpcContractRow,
  type BpcSearchFilter,
} from '@/engine/contracts/bpcSearch';
import {
  loadPublicBpcContracts,
  type PublicBpcContractsSnapshot,
} from '@/features/bpcContracts/syncedContracts';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import { loadBlueprints } from '@/sde/loadSde';
import { isSyncConfigured } from '@/app/syncStatus';
import type { CachedResult } from '@/esi/cache';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { rankedSearch } from '@/lib/rankedSearch';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

interface Snapshot {
  contractsResult: CachedResult<PublicBpcContractsSnapshot> | null;
  syncConfigured: boolean;
  blueprintNames: Map<number, string>;
  regionNames: Map<number, string>;
}

async function loadBpcContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  if (!isSyncConfigured()) {
    return {
      contractsResult: null,
      syncConfigured: false,
      blueprintNames: new Map(),
      regionNames: new Map(),
    };
  }

  const [contractsResult, blueprintMap] = await Promise.all([
    loadPublicBpcContracts(characterId),
    loadBlueprints(),
  ]);
  const blueprintNames = new Map(
    Object.entries(blueprintMap).map(([typeId, bp]) => [Number(typeId), bp.name])
  );

  // Already superseded: skip the region-name fan-out, its result would be discarded.
  const rows = contractsResult?.data?.rows ?? [];
  const regionIds = signal.cancelled ? [] : [...new Set(rows.map((r) => r.regionId))];
  const regionEntries = await Promise.all(
    regionIds.map(async (id): Promise<[number, string] | null> => {
      const name = await loadRegionName(id);
      return name ? [id, name] : null;
    })
  );
  const regionNames = new Map(regionEntries.filter((entry) => entry !== null));

  return { contractsResult, syncConfigured: true, blueprintNames, regionNames };
}

interface UiFilter {
  typeQuery: string;
  regionId: number | null;
  minMe: string;
  minTe: string;
  minRuns: string;
  maxPrice: string;
}

const EMPTY_UI_FILTER: UiFilter = {
  typeQuery: '',
  regionId: null,
  minMe: '',
  minTe: '',
  minRuns: '',
  maxPrice: '',
};

const ALL_REGIONS = 'all';
const TYPE_SEARCH_LIMIT = 50;

/** Positive-integer text field to a filter number, or null when blank/invalid — never NaN reaching the engine filter. */
function parsePositiveNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Rows shown before "show all" (same precedent as Contracts/the market order book). */
const ROW_CAP = 50;

interface BpcFilterBarProps {
  filter: UiFilter;
  onChange: (filter: UiFilter) => void;
  regionOptions: { id: number; name: string }[];
}

function BpcFilterBar({ filter, onChange, regionOptions }: BpcFilterBarProps) {
  const { t } = useTranslation();
  const activeCount = [
    filter.typeQuery,
    filter.regionId !== null,
    filter.minMe,
    filter.minTe,
    filter.minRuns,
    filter.maxPrice,
  ].filter(Boolean).length;

  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeCount}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.typeQuery}
          onChange={(event) => onChange({ ...filter, typeQuery: event.target.value })}
          placeholder={t('bpcContracts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('bpcContracts.regionLabel')}>
            <Select
              value={draft.regionId === null ? ALL_REGIONS : String(draft.regionId)}
              onValueChange={(value) =>
                setDraft({ ...draft, regionId: value === ALL_REGIONS ? null : Number(value) })
              }
            >
              <SelectTrigger aria-label={t('bpcContracts.regionLabel')} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS}>{t('bpcContracts.allRegions')}</SelectItem>
                {regionOptions.map((region) => (
                  <SelectItem key={region.id} value={String(region.id)}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t('bpcContracts.minMeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              aria-label={t('bpcContracts.minMeLabel')}
              placeholder={t('bpcContracts.minMeLabel')}
              className="w-24"
              value={draft.minMe}
              onChange={(event) => setDraft({ ...draft, minMe: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.minTeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              aria-label={t('bpcContracts.minTeLabel')}
              placeholder={t('bpcContracts.minTeLabel')}
              className="w-24"
              value={draft.minTe}
              onChange={(event) => setDraft({ ...draft, minTe: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.minRunsLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('bpcContracts.minRunsLabel')}
              placeholder={t('bpcContracts.minRunsLabel')}
              className="w-24"
              value={draft.minRuns}
              onChange={(event) => setDraft({ ...draft, minRuns: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.maxPriceLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('bpcContracts.maxPriceLabel')}
              placeholder={t('bpcContracts.maxPriceLabel')}
              className="w-32"
              value={draft.maxPrice}
              onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
            />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}

/** Public BPC contract search (issue #608, ADR 0013): searches a server-synced snapshot of every publicly contracted blueprint copy for sale, across every region. Not per-character — read-only, cached for offline. */
export function BpcContracts() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadBpcContractsSnapshot,
    undefined,
    { cacheKey: 'bpcContracts' }
  );

  const contractsResult = data?.contractsResult ?? null;
  const syncConfigured = data?.syncConfigured ?? true;
  const blueprintNames = data?.blueprintNames ?? EMPTY_MAP;
  const regionNames = data?.regionNames ?? EMPTY_MAP;

  const [uiFilter, setUiFilter] = useState<UiFilter>(EMPTY_UI_FILTER);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => contractsResult?.data?.rows ?? [], [contractsResult]);

  const typeOptions = useMemo(
    () => listedBlueprintTypeOptions(rows, blueprintNames),
    [rows, blueprintNames]
  );
  const regionOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.regionId))]
        .map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, regionNames]
  );

  const engineFilter: BpcSearchFilter = useMemo(() => {
    const typeIds =
      uiFilter.typeQuery.trim().length === 0
        ? null
        : new Set(
            rankedSearch(typeOptions, uiFilter.typeQuery, {
              primary: (o) => o.name,
              limit: TYPE_SEARCH_LIMIT,
            }).map((o) => o.typeId)
          );
    return {
      ...EMPTY_BPC_SEARCH_FILTER,
      typeIds,
      regionId: uiFilter.regionId,
      minMe: parsePositiveNumber(uiFilter.minMe),
      minTe: parsePositiveNumber(uiFilter.minTe),
      minRuns: parsePositiveNumber(uiFilter.minRuns),
      maxPrice: parsePositiveNumber(uiFilter.maxPrice),
    };
  }, [uiFilter, typeOptions]);

  const filteredRows = useMemo(() => filterBpcContracts(rows, engineFilter), [rows, engineFilter]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, ROW_CAP);

  const columns = useMemo<DataTableColumn<BpcContractRow>[]>(
    () => [
      {
        id: 'item',
        header: t('bpcContracts.itemColumn'),
        primary: true,
        sortValue: (row) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
        render: (row) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
      },
      {
        id: 'me',
        header: t('bpcContracts.meColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.me,
        render: (row) => row.me,
      },
      {
        id: 'te',
        header: t('bpcContracts.teColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.te,
        render: (row) => row.te,
      },
      {
        id: 'runs',
        header: t('bpcContracts.runsColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.runs,
        render: (row) => row.runs,
      },
      {
        id: 'qty',
        header: t('bpcContracts.qtyColumn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        render: (row) => row.quantity,
      },
      {
        id: 'price',
        header: t('bpcContracts.priceColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.buyout ?? row.price,
        render: (row) =>
          row.isAuction
            ? row.buyout !== undefined
              ? t('bpcContracts.buyout', { price: formatIsk(row.buyout, 2) })
              : t('bpcContracts.startingBid', { price: formatIsk(row.price, 2) })
            : formatIsk(row.price, 2),
      },
      {
        id: 'region',
        header: t('bpcContracts.regionColumn'),
        sortValue: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
        render: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
      },
      {
        id: 'expires',
        header: t('bpcContracts.expiresColumn'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (row) => row.dateExpired,
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
      },
    ],
    [t, blueprintNames, regionNames, timeZone]
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
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('bpcContracts.title')}
        meta={
          contractsResult?.data?.lastSyncedAt && (
            <DataAgeBadge date={new Date(contractsResult.data.lastSyncedAt)} />
          )
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('bpcContracts.refresh')}
            onClick={refresh}
            disabled={loading}
          />
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !syncConfigured ? (
        <EmptyState
          title={t('bpcContracts.notConfiguredTitle')}
          hint={t('bpcContracts.notConfiguredHint')}
        />
      ) : rows.length === 0 ? (
        <EmptyState title={t('bpcContracts.emptyTitle')} hint={t('bpcContracts.emptyHint')} />
      ) : (
        <Panel padded={false}>
          {contractsResult?.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          <BpcFilterBar filter={uiFilter} onChange={setUiFilter} regionOptions={regionOptions} />
          {filteredRows.length === 0 ? (
            <EmptyState title={t('bpcContracts.noFilterMatches')} className="py-8" />
          ) : (
            <>
              <DataTable
                label={t('bpcContracts.title')}
                columns={columns}
                rows={visibleRows}
                rowKey={(row) => `${row.contractId}:${row.typeId}`}
                defaultSort={{ columnId: 'price', direction: 'asc' }}
              />
              {!showAll && filteredRows.length > ROW_CAP && (
                <div className="px-3 py-2">
                  <Button size="sm" onClick={() => setShowAll(true)}>
                    {t('bpcContracts.showAll', { count: filteredRows.length })}
                  </Button>
                </div>
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

/** Stable identity, so a missing snapshot doesn't invalidate memoized columns/options every render. */
const EMPTY_MAP: ReadonlyMap<number, string> = new Map();
