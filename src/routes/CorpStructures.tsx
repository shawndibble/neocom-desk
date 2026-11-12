/**
 * `/corp/structures` — every Upwell structure in every corporation the
 * account's Characters can read, as one table (issue #6089): where each is,
 * how long its fuel lasts, what state it is in and which services are off.
 *
 * Read across corporations, not only the active Character's: a pilot with a
 * structure in each of a dozen holding corporations is the reader this page is
 * for, so it is gated on the account (`loadAllStructuresBoard`), not on
 * `useCorpRouteGate`. Rows come from the same model the Structures widget draws
 * (`structureRows`), so its Problems only and this page's keep the same rows.
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CachedNotice,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextInput,
  Tooltip,
  textActionClassName,
  type ActiveFilter,
  type DataTableColumn,
} from '@/components/ui';
import { SEVERITY_TEXT } from '@/components/ui/severityTone';
import * as Icon from '@/components/ui/icons';
import { SecurityStatus } from '@/components/SecurityStatus';
import { DataGate } from '@/components/DataGate';
import type { BoardExtractionSource } from '@/engine/corp/board';
import { FUEL_BLOCK_VOLUME_M3, fuelPlan, fuelUntilMs, type FuelPlan } from '@/engine/corp/fuelPlan';
import { shiftUtcDate, utcDay } from '@/engine/localDay';
import { structureStateLabel } from '@/features/corp/boardSources';
import { corpLabelText, type CorpLabel } from '@/features/corp/corpTicker';
import { StructureDetail } from '@/features/corp/structures/StructureDetail';
import { loadStructureFuelBays, type CorpFuelBays } from '@/features/corp/structures/fuelBays';
import { useFuelUntil } from '@/features/corp/structures/fuelUntilPref';
import {
  byUrgency,
  filterStructureRows,
  shortStructureName,
  structureRows,
  structureWhen,
  type StructureFilter,
  type StructureRow,
} from '@/features/corp/structures/structureRows';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  loadAllMoonChunksBoard,
  loadAllStructuresBoard,
  type StructuresBoardData,
} from '@/features/overview/data/boardData';
import { structuresView } from '@/features/overview/data/corpCards';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { writeToClipboard } from '@/lib/clipboard';
import { formatEveDateTime } from '@/lib/eveTime';
import { formatCount } from '@/lib/formatCount';
import { createNumberFormat } from '@/lib/numberLocale';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useNow } from '@/lib/useNow';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useUrlParam, useUrlParams } from '@/lib/useUrlState';
import { boolParam, optionalIdParam, optionalSortParam, textParam } from '@/lib/urlState';

const FILTER_PARAMS = {
  q: textParam(),
  corp: optionalIdParam(),
  problems: boolParam(),
};
const SORT_PARAM = optionalSortParam();
const OPEN_PARAM = optionalIdParam();

/** "Any" sentinel for the corporation select: Radix reads `''` as "nothing selected". */
const ANY = '__any';
const DASH = '—';
const NO_CORPORATIONS: ReadonlyMap<number, CorpLabel> = new Map();
/** A slow burn (under a block a day) keeps its tenth rather than rounding to 0. */
const formatTenths = createNumberFormat({ maximumFractionDigits: 1 });
/** The "Fuel until" date an untouched page plans toward, in days from today. */
const DEFAULT_FUEL_DAYS = 30;

/** A structure's fuel bay and what it implies; `blocks` is null when the bay cannot be read. */
interface FuelRow {
  blocks: number | null;
  plan: FuelPlan;
}

interface StructuresSnapshot {
  data: StructuresBoardData;
  /** Refinery extractions by structure id; empty when no reader can read them. */
  extractions: ReadonlyMap<number, BoardExtractionSource>;
  typeNames: ReadonlyMap<number, string>;
  /** Fuel bays by corporation id; a corporation without assets access has no entry. */
  fuelBays: ReadonlyMap<number, CorpFuelBays>;
}

async function loadStructuresSnapshot(): Promise<StructuresSnapshot> {
  const [data, moons, fuelBays] = await Promise.all([
    loadAllStructuresBoard(),
    // Extractions only add a section to a refinery's detail: a failed read costs that, nothing else.
    loadAllMoonChunksBoard().catch(() => null),
    // Fuel bays only add the block counts: without them every row shows time left alone.
    loadStructureFuelBays().catch(() => new Map<number, CorpFuelBays>()),
  ]);
  const typeIds = (data.structures ?? [])
    .map((structure) => structure.typeId)
    .filter((id): id is number => id !== undefined);
  return {
    data,
    extractions: new Map(
      (moons?.extractions ?? []).map((extraction) => [extraction.structureId, extraction])
    ),
    typeNames: typeIds.length === 0 ? new Map() : await loadTypeNames(typeIds),
    fuelBays,
  };
}

/** A system name as the structure's own name gives it, for a system the index lacks. */
function namePrefix(name: string): string {
  const cut = name.indexOf(' - ');
  return cut > 0 ? name.slice(0, cut) : DASH;
}

export function CorpStructures() {
  const { t } = useTranslation();
  const now = useNow();
  const systems = useSolarSystemIndex();
  const snapshot = useRouteSnapshot<StructuresSnapshot>(loadStructuresSnapshot, undefined, {
    staleWhileRevalidate: true,
    cacheKey: 'corp-structures',
  });
  const data = snapshot.data?.data ?? null;
  const [params, setParams] = useUrlParams(FILTER_PARAMS);
  const [sort, setSort] = useUrlParam('sort', SORT_PARAM);
  const [openId, setOpenId] = useUrlParam('structure', OPEN_PARAM);
  const [search] = useDebouncedValue(params.q);
  const storedFuelUntil = useFuelUntil((s) => s.value);
  const setFuelUntil = useFuelUntil((s) => s.setValue);
  useHydratedStore(useFuelUntil);
  const today = utcDay(now);
  // A saved date that has passed would zero every row: plan the default month instead.
  const fuelUntil =
    storedFuelUntil !== null && storedFuelUntil >= today
      ? storedFuelUntil
      : shiftUtcDate(today, DEFAULT_FUEL_DAYS);
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);

  const view = useMemo(() => (data ? structuresView(data, now) : null), [data, now]);
  const rows = useMemo(
    () =>
      view?.items && data?.structures
        ? structureRows(data.structures, view.items).sort(byUrgency)
        : [],
    [view, data]
  );
  const corporations = data?.corporations ?? NO_CORPORATIONS;
  const fuelRows = useMemo(() => {
    const byId = new Map<number, FuelRow>();
    const untilMs = fuelUntilMs(fuelUntil);
    const expiryReadAtMs = data?.fetchedAt?.getTime() ?? 0;
    for (const { source } of rows) {
      const corp =
        source.corporationId === undefined
          ? undefined
          : snapshot.data?.fuelBays.get(source.corporationId);
      const blocks = corp ? (corp.bays.get(source.structureId) ?? 0) : null;
      byId.set(source.structureId, {
        blocks,
        plan: fuelPlan({
          blocks,
          bayReadAtMs: corp?.readAt.getTime() ?? 0,
          fuelExpiresMs: source.fuelExpiresMs,
          expiryReadAtMs,
          untilMs,
        }),
      });
    }
    return byId;
  }, [rows, data, snapshot.data, fuelUntil]);
  const fuelOf = useCallback(
    (row: StructureRow) => fuelRows.get(row.source.structureId),
    [fuelRows]
  );
  const multiCorp = corporations.size > 1;
  const corpOf = useCallback(
    (row: StructureRow) =>
      row.source.corporationId === undefined
        ? undefined
        : corporations.get(row.source.corporationId),
    [corporations]
  );
  const systemOf = useCallback(
    (row: StructureRow) =>
      row.source.systemId === undefined ? undefined : systems?.get(row.source.systemId),
    [systems]
  );
  const systemName = useCallback(
    (row: StructureRow) => systemOf(row)?.name ?? namePrefix(row.source.name),
    [systemOf]
  );

  const filter = useMemo<StructureFilter>(
    () => ({ corp: params.corp, problems: params.problems, q: search }),
    [params.corp, params.problems, search]
  );
  const visible = useMemo(
    () =>
      filterStructureRows(rows, filter, {
        corporation: (id) => {
          const corp = id === undefined ? undefined : corporations.get(id);
          return corp ? `${corp.name} ${corp.ticker}` : '';
        },
        system: (id) => (id === undefined ? '' : (systems?.get(id)?.name ?? '')),
      }),
    [rows, filter, corporations, systems]
  );
  const problemCount = rows.filter((row) => row.problem).length;
  const corpOptions = useMemo(
    () => [...corporations].sort(([, a], [, b]) => a.name.localeCompare(b.name)),
    [corporations]
  );

  const columns = useMemo<DataTableColumn<StructureRow>[]>(() => {
    const C = 'corp.structures.col';
    return [
      ...(multiCorp
        ? [
            {
              id: 'corp',
              header: t(`${C}.corp`),
              phoneHidden: true,
              render: (row: StructureRow) => {
                const corp = corpOf(row);
                return corp ? (
                  <Tooltip content={corp.name}>
                    <span>{corp.ticker}</span>
                  </Tooltip>
                ) : (
                  DASH
                );
              },
              sortValue: (row: StructureRow) => corpOf(row)?.ticker,
            },
          ]
        : []),
      {
        id: 'structure',
        header: t(`${C}.structure`),
        primary: true,
        render: (row) => (
          <span className="font-medium text-accent">{shortStructureName(row.source.name)}</span>
        ),
        sortValue: (row) => shortStructureName(row.source.name),
      },
      {
        id: 'type',
        header: t(`${C}.type`),
        phoneHidden: true,
        render: (row) =>
          (row.source.typeId !== undefined && snapshot.data?.typeNames.get(row.source.typeId)) ||
          DASH,
        sortValue: (row) =>
          row.source.typeId === undefined
            ? undefined
            : snapshot.data?.typeNames.get(row.source.typeId),
      },
      {
        id: 'system',
        header: t(`${C}.system`),
        render: (row) => {
          const system = systemOf(row);
          return (
            <span className="inline-flex items-center gap-1.5">
              {systemName(row)}
              {system && <SecurityStatus security={system.security} />}
            </span>
          );
        },
        sortValue: systemName,
      },
      {
        id: 'fuel',
        header: t(`${C}.fuel`),
        align: 'right',
        render: (row) =>
          row.fuel ? (
            <span className="flex flex-col items-end">
              <span className={SEVERITY_TEXT[row.fuel.severity]}>{structureWhen(row.fuel, t)}</span>
              {row.fuel.deadlineMs !== null && (
                <span className="text-xs text-text-dim">
                  {formatEveDateTime(new Date(row.fuel.deadlineMs))}
                </span>
              )}
            </span>
          ) : (
            DASH
          ),
        sortValue: (row) => (row.fuel ? row.remaining : undefined),
      },
      {
        id: 'blocks',
        header: t(`${C}.blocks`),
        align: 'right',
        headerTooltip: t('corp.structures.fuelPlan.blocksHint'),
        render: (row) => {
          const fuel = fuelOf(row);
          if (!fuel || fuel.blocks === null)
            return (
              <span className="text-xs text-text-dim">
                {t('corp.structures.fuelPlan.noBayAccess')}
              </span>
            );
          return (
            <span className="flex flex-col items-end">
              <span className="tabular-nums">{formatCount(fuel.blocks)}</span>
              {fuel.plan.perDay !== null && (
                <span className="text-xs text-text-dim">
                  {t('corp.structures.fuelPlan.perDay', {
                    rate:
                      fuel.plan.perDay < 1
                        ? formatTenths(fuel.plan.perDay)
                        : formatCount(fuel.plan.perDay),
                  })}
                </span>
              )}
            </span>
          );
        },
        sortValue: (row) => fuelOf(row)?.blocks ?? undefined,
      },
      {
        id: 'needed',
        header: t(`${C}.needed`),
        align: 'right',
        headerTooltip: t('corp.structures.fuelPlan.neededHint'),
        render: (row) => {
          const needed = fuelOf(row)?.plan.needed ?? null;
          return needed === null ? (
            DASH
          ) : (
            <span className="tabular-nums">{formatCount(needed)}</span>
          );
        },
        sortValue: (row) => fuelOf(row)?.plan.needed ?? undefined,
      },
      {
        id: 'state',
        header: t(`${C}.state`),
        phoneHidden: true,
        render: (row) => (row.source.state ? structureStateLabel(row.source.state) : DASH),
        sortValue: (row) => row.source.state ?? undefined,
      },
      {
        id: 'timer',
        header: t(`${C}.timer`),
        align: 'right',
        render: (row) =>
          row.timer ? (
            <span className={SEVERITY_TEXT[row.timer.severity]}>{structureWhen(row.timer, t)}</span>
          ) : (
            DASH
          ),
        sortValue: (row) => row.timer?.deadlineMs ?? undefined,
      },
      {
        id: 'services',
        header: t(`${C}.services`),
        phoneHidden: true,
        render: (row) => {
          const online = row.source.services.filter((service) => service.state === 'online');
          if (row.source.services.length === 0) return t('corp.structures.servicesNone');
          return (
            <span>
              {t('corp.structures.servicesOnline', { count: online.length })}
              {row.offline.length > 0 && (
                <span className="text-danger">
                  {' · '}
                  {row.offline.map((item) => item.detail).join(', ')}
                </span>
              )}
            </span>
          );
        },
        sortValue: (row) => row.offline.length,
      },
      {
        id: 'unanchoring',
        header: t(`${C}.unanchoring`),
        align: 'right',
        phoneHidden: true,
        render: (row) => (row.unanchor ? structureWhen(row.unanchor, t) : DASH),
        sortValue: (row) => row.unanchor?.deadlineMs ?? undefined,
      },
    ];
  }, [t, multiCorp, corpOf, systemOf, systemName, snapshot.data, fuelOf]);

  /** The visible rows that need blocks, in table order: the footer total and Copy list both read this. */
  const shoppingList = useMemo(
    () =>
      visible.flatMap((row) => {
        const needed = fuelOf(row)?.plan.needed ?? null;
        return needed !== null && needed > 0 ? [{ row, needed }] : [];
      }),
    [visible, fuelOf]
  );
  const totalNeeded = shoppingList.reduce((sum, item) => sum + item.needed, 0);
  const unknownNeeded = visible.filter((row) => (fuelOf(row)?.plan.needed ?? null) === null).length;
  const noBayAccess = visible.some((row) => (fuelOf(row)?.blocks ?? null) === null);

  async function copyList() {
    const lines = shoppingList.map(({ row, needed }) =>
      t('corp.structures.fuelPlan.copyLine', {
        structure: shortStructureName(row.source.name),
        system: systemName(row),
        count: needed,
        blocks: formatCount(needed),
      })
    );
    lines.push(
      t('corp.structures.fuelPlan.copyTotal', {
        date: fuelUntil,
        count: totalNeeded,
        blocks: formatCount(totalNeeded),
        volume: formatCount(totalNeeded * FUEL_BLOCK_VOLUME_M3),
      })
    );
    if (unknownNeeded > 0)
      lines.push(t('corp.structures.fuelPlan.unknown', { count: unknownNeeded }));
    try {
      await writeToClipboard(lines.join('\n'));
      flash('copied');
    } catch {
      flash('failed');
    }
  }

  const activeFilters = useMemo(() => {
    const active: ActiveFilter<StructureFilter>[] = [];
    if (filter.corp !== null)
      active.push({
        label: t('corp.structures.corpFilterLabel'),
        value: corporations.get(filter.corp)?.name ?? String(filter.corp),
        clear: (next) => ({ ...next, corp: null }),
      });
    if (filter.problems)
      active.push({
        label: t('corp.structures.problemsOnly'),
        clear: (next) => ({ ...next, problems: false }),
      });
    return active;
  }, [filter, corporations, t]);

  const open =
    openId === null ? null : (rows.find((row) => row.source.structureId === openId) ?? null);

  if (!snapshot.hydrated) return <Spinner />;
  const unreadable = data !== null && data.structures === null;

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title={t('corp.structures.title')}
        meta={
          data?.fetchedAt ? (
            <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('corp.structures.refresh')}
            onClick={snapshot.refresh}
            disabled={snapshot.loading}
          />
        }
      />
      <DataGate
        status={snapshot.loading && data === null ? 'busy' : data === null ? 'failed' : 'ok'}
        title={t('common.couldntLoad')}
        hint={t('corp.structures.loadFailedHint')}
        onRetry={snapshot.refresh}
        resetKey={snapshot.activeCharacterId}
        busy={<Spinner />}
      >
        {unreadable ? (
          <EmptyState
            title={t('corp.structures.noAccessTitle')}
            hint={t('corp.structures.noAccessHint')}
          />
        ) : (
          <div className="space-y-2">
            {data?.partlyFailed && (
              <p className="text-sm text-warning" role="status">
                {t('corp.structures.partlyFailed')}
              </p>
            )}
            {snapshot.refreshCount > 0 && snapshot.error !== null && data && (
              <CachedNotice withBadge fetchedAt={data.fetchedAt} refreshFailed />
            )}
            <FilterBar
              value={{ corp: params.corp, problems: params.problems, q: params.q }}
              onChange={(next) => setParams({ corp: next.corp, problems: next.problems })}
              active={activeFilters}
              resultCount={visible.length}
              search={
                <SearchInput
                  value={params.q}
                  onChange={(e) => setParams({ q: e.target.value })}
                  placeholder={t('corp.structures.searchPlaceholder')}
                  className="min-w-48 flex-1"
                />
              }
            >
              {(draft, setDraft) => (
                <>
                  <FilterField
                    label={t('corp.structures.problemsOnly')}
                    stretch={false}
                    hideCaption
                  >
                    <FilterChip
                      label={t('corp.structures.problemsOnly')}
                      count={problemCount}
                      selected={draft.problems}
                      onToggle={() => setDraft({ ...draft, problems: !draft.problems })}
                      tooltip={t('corp.structures.problemsOnlyHint')}
                      size="md"
                    />
                  </FilterField>
                  {multiCorp && (
                    <FilterField label={t('corp.structures.corpFilterLabel')}>
                      <Select
                        value={draft.corp === null ? ANY : String(draft.corp)}
                        onValueChange={(value) =>
                          setDraft({ ...draft, corp: value === ANY ? null : Number(value) })
                        }
                      >
                        <SelectTrigger
                          aria-label={t('corp.structures.corpFilterLabel')}
                          active={draft.corp !== null}
                          className="w-56"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>{t('corp.structures.corpFilterAll')}</SelectItem>
                          {corpOptions.map(([id, corp]) => (
                            <SelectItem key={id} value={String(id)}>
                              {corpLabelText(corp)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterField>
                  )}
                </>
              )}
            </FilterBar>
            <Panel padded={false}>
              {rows.length === 0 ? (
                <EmptyState
                  title={t('corp.structures.empty')}
                  hint={t('corp.structures.emptyHint')}
                  className="py-8"
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  title={t('corp.structures.noFilterMatches')}
                  hint={t('corp.structures.noFilterMatchesHint')}
                  className="py-8"
                  action={
                    <Button
                      size="sm"
                      onClick={() => setParams({ q: '', corp: null, problems: false })}
                    >
                      {t('common.resetFilters')}
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  label={t('corp.structures.title')}
                  columns={columns}
                  rows={visible}
                  rowKey={(row) => row.source.structureId}
                  sort={sort}
                  onSortChange={setSort}
                  // Opening pushes, so Back closes the panel; closing replaces.
                  onRowClick={(row) => setOpenId(row.source.structureId, { push: true })}
                  selectedRowKey={openId}
                  mobileSort
                />
              )}
              {visible.length > 0 && (
                <div className="space-y-1 border-t border-border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-1 text-xs text-text-dim">
                      {t('corp.structures.fuelPlan.until')}
                      <TextInput
                        type="date"
                        className="w-36"
                        value={fuelUntil}
                        min={today}
                        onChange={(event) =>
                          void setFuelUntil(event.target.value === '' ? null : event.target.value)
                        }
                      />
                    </label>
                    <span data-testid="fuel-total" className="tabular-nums">
                      {t('corp.structures.fuelPlan.total', {
                        count: totalNeeded,
                        blocks: formatCount(totalNeeded),
                        volume: formatCount(totalNeeded * FUEL_BLOCK_VOLUME_M3),
                      })}
                      {unknownNeeded > 0 && (
                        <span className="text-text-dim">
                          {' · '}
                          {t('corp.structures.fuelPlan.unknown', { count: unknownNeeded })}
                        </span>
                      )}
                    </span>
                    {shoppingList.length > 0 && (
                      <button
                        type="button"
                        className={textActionClassName('ml-auto')}
                        onClick={() => void copyList()}
                      >
                        {copied === 'copied'
                          ? t('corp.structures.fuelPlan.copied')
                          : copied === 'failed'
                            ? t('corp.structures.fuelPlan.copyFailed')
                            : t('corp.structures.fuelPlan.copy')}
                      </button>
                    )}
                  </div>
                  {noBayAccess && (
                    <p className="text-xs text-text-dim">
                      {t('corp.structures.fuelPlan.noBayAccessHint')}
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </div>
        )}
      </DataGate>
      <StructureDetail
        row={open}
        onClose={() => setOpenId(null)}
        corp={open ? corpOf(open) : undefined}
        system={open ? systemOf(open) : undefined}
        typeName={
          open?.source.typeId === undefined
            ? undefined
            : snapshot.data?.typeNames.get(open.source.typeId)
        }
        extraction={open ? snapshot.data?.extractions.get(open.source.structureId) : undefined}
      />
    </div>
  );
}
