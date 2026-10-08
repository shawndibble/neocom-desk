/**
 * The Wallet Balance tab body (issue #2935): the net worth chart, its layer
 * legend, and the table beneath it. One Character shows layers stacked; a
 * wider scope shows one line per Character with a "Balance by character" table
 * whose rows drill into that Character.
 */
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import {
  DataTable,
  EmptyState,
  Panel,
  RowCaret,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { inlineLinkClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { walletBalancesCsvColumns } from '@/features/character/walletBalancesCsv';
import { iskToneClass } from '@/features/character/format';
import { lineRows, stackRows } from '@/engine/netWorth/chartRows';
import {
  buildCharacterSeries,
  layerValues,
  listedLayers,
  netWorthOf,
  toggleHidden,
  totalsFor,
  type CharacterSeries,
  type LayerId,
  type LayerValues,
} from '@/engine/netWorth/series';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { LAYER_LABEL_KEYS, LAYER_LINKS, LAYER_SWATCH } from './layerMeta';
import { useNetWorthHiddenCharacters, useNetWorthHiddenLayers } from './netWorthSettings';
import { buildTableRows, type NetWorthTableRow } from './tableRows';
import { useNetWorthData } from './useNetWorthData';

/** Recharts stays out of the initial bundle: it loads when a chart first renders. */
const LazyNetWorthChart = lazy(() => guarded(() => import('./NetWorthChart')));

export interface NetWorthCharacter {
  characterId: number;
  name: string;
}

export interface NetWorthPanelProps {
  /** `single` = one Character's layers; `multi` = one line per Character. */
  mode: 'single' | 'multi';
  /** The Characters in scope (one for `single`). */
  characters: readonly NetWorthCharacter[];
  /** Live wallet balance per Character, where the page has fetched it. */
  liveWallet: ReadonlyMap<number, { balance: number | null; needsReauth: boolean }>;
  /** The Character filter, shown in the panel title bar. */
  filterMeta?: ReactNode;
  /** The panel is a drill into one Character from the all-Characters view. */
  drilled?: boolean;
  onDrill: (characterId: number) => void;
  onBack: () => void;
  /** Extra title-bar actions (the page refresh). */
  actions?: ReactNode;
  /** Replaces the title when the page already says what this is. */
  title?: string;
  /** Stats shown beside Net worth in the stat row (the Wallet page's EverMarks). */
  stats?: ReactNode;
  /** Banners and warnings shown between the stat row and the chart. */
  notices?: ReactNode;
}

const NO_SERIES: CharacterSeries = { points: [], firstSnapshotDay: null, gapDays: [] };
const EMPTY_WALLET: ReadonlyMap<string, number> = new Map();

function useHidden() {
  const hiddenLayers = useNetWorthHiddenLayers((s) => s.value);
  const setHiddenLayers = useNetWorthHiddenLayers((s) => s.setValue);
  const hydrateLayers = useNetWorthHiddenLayers((s) => s.hydrate);
  const hiddenCharacters = useNetWorthHiddenCharacters((s) => s.value);
  const setHiddenCharacters = useNetWorthHiddenCharacters((s) => s.setValue);
  const hydrateCharacters = useNetWorthHiddenCharacters((s) => s.hydrate);
  useEffect(() => {
    void hydrateLayers();
    void hydrateCharacters();
  }, [hydrateLayers, hydrateCharacters]);
  return { hiddenLayers, setHiddenLayers, hiddenCharacters, setHiddenCharacters };
}

function LayerPicker({
  listed,
  shown,
  onToggle,
}: {
  listed: readonly LayerId[];
  shown: readonly LayerId[];
  onToggle: (id: LayerId) => void;
}) {
  const { t } = useTranslation();
  const options = useMemo(
    () =>
      listed.map((id) => ({
        id,
        label: t(LAYER_LABEL_KEYS[id]),
        swatch: <span aria-hidden="true" className={cx('size-2.5 rounded-xs', LAYER_SWATCH[id])} />,
      })),
    [t, listed]
  );
  const selected = useMemo(() => new Set(shown), [shown]);
  return (
    <MultiSelect
      trigger={
        <Button size="md">
          {t('wallet.netWorth.seriesButton', { shown: selected.size, total: listed.length })}
        </Button>
      }
      options={options}
      selected={selected}
      // The last series cannot be switched off (`toggleHidden`): an empty chart says nothing.
      onToggle={onToggle}
      searchPlaceholder={t('wallet.netWorth.seriesSearch')}
      noResultsLabel={t('wallet.netWorth.seriesNoResults')}
    />
  );
}

interface LayerRow {
  id: LayerId;
  value: number;
  share: number;
  shown: boolean;
}

function LayerTable({
  values,
  listed,
  shown,
}: {
  values: LayerValues;
  listed: readonly LayerId[];
  shown: readonly LayerId[];
}) {
  const { t } = useTranslation();
  const total = netWorthOf(values, shown);
  const rows = useMemo<LayerRow[]>(
    () =>
      listed.map((id) => ({
        id,
        value: values[id],
        share: total > 0 && shown.includes(id) ? values[id] / total : 0,
        shown: shown.includes(id),
      })),
    [values, listed, shown, total]
  );
  const columns = useMemo<DataTableColumn<LayerRow>[]>(
    () => [
      {
        id: 'layer',
        header: t('wallet.netWorth.layerColumn'),
        stickyStart: true,
        render: (row) => (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={cx('size-2.5 rounded-xs', LAYER_SWATCH[row.id])} />
            {t(LAYER_LABEL_KEYS[row.id])}
          </span>
        ),
      },
      {
        id: 'value',
        header: t('wallet.netWorth.valueColumn'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => formatIsk(row.value),
      },
      {
        id: 'share',
        header: t('wallet.netWorth.shareColumn'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        render: (row) => (row.shown ? `${(row.share * 100).toFixed(1)}%` : '—'),
      },
      {
        id: 'opens',
        header: t('wallet.netWorth.opensColumn'),
        render: (row) => (
          <Link to={LAYER_LINKS[row.id]} state={{ from: 'wallet' }} className={inlineLinkClassName}>
            {t(`wallet.netWorth.opens.${row.id}`)}
          </Link>
        ),
      },
    ],
    [t]
  );
  return (
    <DataTable
      label={t('wallet.netWorth.layersTable')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      rowClassName={(row) => (row.shown ? undefined : 'opacity-50')}
      responsive="table"
    />
  );
}

export function NetWorthPanel({
  mode,
  characters,
  liveWallet,
  filterMeta,
  drilled = false,
  onDrill,
  onBack,
  actions,
  title,
  stats,
  notices,
}: NetWorthPanelProps) {
  const { t } = useTranslation();
  const { hiddenLayers, setHiddenLayers, hiddenCharacters, setHiddenCharacters } = useHidden();
  const ids = useMemo(() => characters.map((c) => c.characterId), [characters]);
  const data = useNetWorthData(ids);

  const listed = useMemo(
    () =>
      listedLayers(
        characters.flatMap(({ characterId }) => data.snapshotsByCharacter.get(characterId) ?? [])
      ),
    [characters, data.snapshotsByCharacter]
  );
  const shown = useMemo(() => {
    const visible = listed.filter((id) => !hiddenLayers.includes(id));
    // A layer that goes empty can leave only hidden ones listed; an empty chart says nothing.
    return visible.length > 0 ? visible : listed;
  }, [listed, hiddenLayers]);
  const toggleLayer = (id: LayerId) =>
    void setHiddenLayers([...toggleHidden(hiddenLayers, id, listed)]);

  const seriesById = useMemo(() => {
    const map = new Map<number, CharacterSeries>();
    for (const { characterId } of characters) {
      map.set(
        characterId,
        buildCharacterSeries({
          walletByDay: data.walletDailyByCharacter.get(characterId) ?? EMPTY_WALLET,
          snapshots: data.snapshotsByCharacter.get(characterId) ?? [],
        })
      );
    }
    return map;
  }, [characters, data.snapshotsByCharacter, data.walletDailyByCharacter]);

  const latest = useMemo(() => {
    const map = new Map<number, LayerValues>();
    for (const [characterId, rows] of data.snapshotsByCharacter) {
      const last = rows[rows.length - 1];
      if (last) map.set(characterId, layerValues(last));
    }
    return map;
  }, [data.snapshotsByCharacter]);

  const tableRows = useMemo(
    () => buildTableRows({ characters, latest, covered: data.covered, liveWallet }),
    [characters, latest, data.covered, liveWallet]
  );

  const coveredIds = useMemo(() => ids.filter((id) => data.covered.has(id)), [ids, data.covered]);
  const missingNames = characters
    .filter((c) => !data.covered.has(c.characterId))
    .map((c) => c.name);
  // Hidden ids are device-wide, so a filter can leave none visible; show them all then.
  const unhidden = coveredIds.filter((id) => !hiddenCharacters.includes(id));
  const included = mode === 'multi' && unhidden.length > 0 ? unhidden : coveredIds;
  const totals = useMemo(() => {
    const latestWithLive = new Map(
      tableRows.flatMap((row) =>
        row.layers && !row.needsReauth ? [[row.characterId, row.layers] as const] : []
      )
    );
    return totalsFor(latestWithLive, { included, hidden: [], shown });
  }, [tableRows, included, shown]);

  const csvColumns = useMemo(() => walletBalancesCsvColumns(t, shown), [t, shown]);
  const tableExport = useTableExport({
    surface: 'wallet-balances',
    rows: tableRows,
    columns: csvColumns,
  });

  const single = mode === 'single' ? (characters[0] ?? null) : null;
  const singleSeries = single ? (seriesById.get(single.characterId) ?? NO_SERIES) : NO_SERIES;
  const singleRows = useMemo(() => stackRows(singleSeries, shown), [singleSeries, shown]);
  const multiSeries = useMemo(
    () => new Map(included.map((id) => [id, seriesById.get(id) ?? NO_SERIES] as const)),
    [included, seriesById]
  );
  const multiRows = useMemo(() => lineRows(multiSeries, shown), [multiSeries, shown]);
  const lines = useMemo(
    () => characters.filter((c) => included.includes(c.characterId)),
    [characters, included]
  );

  const hasPoints = mode === 'single' ? singleRows.length > 0 : multiRows.length > 0;
  const snapshotDays = single ? singleSeries.points.filter((p) => p.layers).length : 0;
  const singleLatest = single ? (tableRows[0]?.layers ?? null) : null;
  const total =
    mode === 'single' ? (singleLatest ? netWorthOf(singleLatest, shown) : 0) : totals.total;
  const excluded = listed.filter((id) => !shown.includes(id)).map((id) => t(LAYER_LABEL_KEYS[id]));

  // One Character's panel says nothing about scope: the page header already names them.
  const readout =
    mode === 'single' ? null : (
      <CharacterScopeReadout scope="all" total={characters.length} missing={missingNames} />
    );

  const toggleCharacter = (id: number) =>
    void setHiddenCharacters([...toggleHidden(hiddenCharacters, id, coveredIds)]);

  const tableColumns = useMemo<DataTableColumn<NetWorthTableRow>[]>(
    () => [
      {
        id: 'show',
        header: t('wallet.netWorth.showColumn'),
        render: (row) => {
          const checked = row.covered && !hiddenCharacters.includes(row.characterId);
          const lastOne = checked && included.length === 1;
          return (
            // A tap here toggles the line; it must not also drill into the row.
            <label
              className={touchCheckboxLabelClassName}
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                aria-label={t('wallet.netWorth.showCharacter', { name: row.characterName })}
                checked={checked}
                disabled={!row.covered || lastOne}
                onChange={() => toggleCharacter(row.characterId)}
              />
            </label>
          );
        },
      },
      {
        id: 'character',
        header: t('wallet.balanceCharacterColumn'),
        stickyStart: true,
        render: (row) => (
          <span className={row.covered ? undefined : 'text-text-dim'}>
            {row.characterName}
            {!row.covered && (
              <span className="block text-[0.6875rem] text-warning">
                {t('wallet.balanceCharacterNotShared')}
              </span>
            )}
          </span>
        ),
      },
      ...listed.map<DataTableColumn<NetWorthTableRow>>((id) => ({
        id,
        header: t(LAYER_LABEL_KEYS[id]),
        align: 'right',
        className: cx('tabular-nums', hiddenLayers.includes(id) && 'opacity-50'),
        render: (row) => {
          if (id === 'isk' && row.needsReauth) {
            return <span className="text-warning">{t('wallet.reauthTitle')}</span>;
          }
          return row.layers ? formatIsk(row.layers[id]) : '—';
        },
      })),
      {
        id: 'total',
        header: t('wallet.netWorth.total'),
        align: 'right',
        className: 'tabular-nums font-semibold',
        render: (row) =>
          row.layers && !row.needsReauth ? (
            <span className={iskToneClass(netWorthOf(row.layers, shown))}>
              {formatIsk(netWorthOf(row.layers, shown))}
            </span>
          ) : (
            '—'
          ),
      },
      { id: 'go', header: '', align: 'right', render: () => <RowCaret /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleCharacter closes over the same values listed
    [t, hiddenCharacters, hiddenLayers, included.length, shown, listed, coveredIds]
  );

  const chart = hasPoints ? (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      }
    >
      {mode === 'single' ? (
        <LazyNetWorthChart
          mode="single"
          label={t('wallet.netWorth.chartLabel')}
          rows={singleRows}
          shown={shown}
          firstSnapshotDay={singleSeries.firstSnapshotDay}
          walletOnlyLabel={
            singleSeries.firstSnapshotDay
              ? t('wallet.netWorth.walletOnlyBefore', {
                  date: formatDateOnly(new Date(Date.parse(singleSeries.firstSnapshotDay)), 'UTC'),
                })
              : ''
          }
        />
      ) : (
        <LazyNetWorthChart
          mode="multi"
          label={t('wallet.netWorth.chartLabel')}
          rows={multiRows}
          lines={lines}
          onSelect={onDrill}
        />
      )}
    </Suspense>
  ) : (
    <EmptyState
      title={t('wallet.netWorth.emptyTitle')}
      hint={t('wallet.netWorth.emptyHint')}
      className="py-8"
    />
  );

  const firstSnapshot = singleSeries.firstSnapshotDay;
  const panel = (
    <Panel
      title={title ?? t('wallet.netWorth.title')}
      meta={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {filterMeta}
          {readout}
        </span>
      }
      actions={
        <span className="flex items-center gap-2">
          <LayerPicker listed={listed} shown={shown} onToggle={toggleLayer} />
          {actions}
        </span>
      }
    >
      {drilled && (
        <button
          type="button"
          onClick={onBack}
          className={cx(
            inlineLinkClassName,
            'mb-2 inline-flex min-h-11 items-center gap-1 md:min-h-0'
          )}
        >
          <span aria-hidden="true">‹</span>
          {t('wallet.netWorth.allCharacters')}
        </button>
      )}
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('wallet.netWorth.total')}
          </p>
          <p className={cx('text-xl font-medium tabular-nums', iskToneClass(total))}>
            {mode === 'single' && !singleLatest ? '—' : formatIsk(total)}
          </p>
        </div>
        {stats}
      </div>
      {excluded.length > 0 && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('wallet.netWorth.excludes', { layers: excluded.join(', ') })}
        </p>
      )}
      {notices}
      <div className="mt-3">{data.ready ? chart : <Spinner label={t('common.loading')} />}</div>
      {mode === 'single' && snapshotDays > 0 && snapshotDays <= 2 && firstSnapshot && (
        <p className="mt-2 text-xs text-text-dim">
          {t('wallet.netWorth.firstDays', {
            date: formatDateOnly(new Date(Date.parse(firstSnapshot)), 'UTC'),
          })}
        </p>
      )}
      {mode === 'single' && singleSeries.gapDays.length > 0 && (
        <p className="mt-2 text-xs text-text-dim">{t('wallet.netWorth.gapNote')}</p>
      )}
      <p className="mt-2 text-[0.6875rem] text-text-dim">{t('wallet.netWorth.footnote')}</p>
      {mode === 'single' && singleLatest && (
        <div className="mt-3">
          <LayerTable values={singleLatest} listed={listed} shown={shown} />
        </div>
      )}
    </Panel>
  );

  if (mode === 'single') return panel;

  return (
    <div className="space-y-4">
      {panel}
      <Panel
        padded={false}
        title={t('wallet.balanceByCharacter')}
        actions={
          <TableActionsMenu name={t('wallet.balanceByCharacter')} tableExport={tableExport} />
        }
      >
        {tableRows.length === 0 ? (
          <EmptyState title={t('wallet.balanceEmpty')} className="py-8" />
        ) : (
          <DataTable
            {...tableExport.tableProps}
            label={t('wallet.balanceByCharacter')}
            columns={tableColumns}
            rows={tableRows}
            rowKey={(row) => row.characterId}
            responsive="table"
            rowClassName={(row) => (row.covered ? 'group' : 'group opacity-70')}
            onRowClick={(row) => onDrill(row.characterId)}
          />
        )}
      </Panel>
    </div>
  );
}
