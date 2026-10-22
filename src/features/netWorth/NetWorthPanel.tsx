/**
 * The Wallet Balance tab body (issue #2935): the net worth chart, its layer
 * legend, and the table beneath it. One Character shows layers stacked; a
 * wider scope shows one line per Character with a "Balance by character" table
 * whose rows drill into that Character.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { lazy, Suspense, useMemo, type ReactNode, type RefObject } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import {
  DataTable,
  EmptyState,
  Panel,
  RowCaret,
  Spinner,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import { Checkbox } from '@/components/ui/Checkbox';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { inlineLinkClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
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
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { formatIsk } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { CharacterSwatch } from './CharacterSwatch';
import { LAYER_LABEL_KEYS, LAYER_SWATCH } from './layerMeta';
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
  /** The panel is a drill into one Character from the all-Characters view. */
  drilled?: boolean;
  onDrill: (characterId: number) => void;
  onBack: () => void;
  /** The panel's title, so a drill swap can hand it focus (issue #3393). */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** The drilled panel's "All characters" button. */
  backRef?: RefObject<HTMLButtonElement | null>;
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
/** Richest first; the headers stay sortable. */
const BALANCE_SORT: DataTableSort = { columnId: 'total', direction: 'desc' };

function useHidden() {
  const hiddenLayers = useNetWorthHiddenLayers((s) => s.value);
  const setHiddenLayers = useNetWorthHiddenLayers((s) => s.setValue);
  const hiddenCharacters = useNetWorthHiddenCharacters((s) => s.value);
  const setHiddenCharacters = useNetWorthHiddenCharacters((s) => s.setValue);
  useHydratedStore(useNetWorthHiddenLayers, useNetWorthHiddenCharacters);
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
      label={t('wallet.netWorth.layersNoun')}
      summary={`${selected.size} / ${listed.length}`}
      triggerAriaLabel={t('wallet.netWorth.layersButton', {
        shown: selected.size,
        total: listed.length,
      })}
      options={options}
      selected={selected}
      // The last series cannot be switched off (`toggleHidden`): an empty chart says nothing.
      onToggle={onToggle}
      searchPlaceholder={t('wallet.netWorth.seriesSearch')}
      noResultsLabel={t('wallet.netWorth.seriesNoResults')}
    />
  );
}

export function NetWorthPanel({
  mode,
  characters,
  liveWallet,
  drilled = false,
  onDrill,
  onBack,
  headingRef,
  backRef,
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
        stickyStartOnPanel: true,
        sortValue: (row) => row.characterName,
        render: (row) => {
          const lineIndex =
            mode === 'multi' ? lines.findIndex((c) => c.characterId === row.characterId) : -1;
          return (
            <span className={cx('flex items-start gap-1.5', !row.covered && 'text-text-dim')}>
              {lineIndex >= 0 && (
                <span className="mt-1.5 flex shrink-0">
                  <CharacterSwatch index={lineIndex} />
                </span>
              )}
              <span>
                {row.characterName}
                {!row.covered && (
                  <span className="block text-[0.6875rem] text-warning">
                    <GrantMissingLink groups={['wallet']} />
                  </span>
                )}
              </span>
            </span>
          );
        },
      },
      ...listed.map<DataTableColumn<NetWorthTableRow>>((id) => ({
        id,
        header: t(LAYER_LABEL_KEYS[id]),
        align: 'right',
        className: cx('tabular-nums', hiddenLayers.includes(id) && 'text-text-dim'),
        sortValue: (row) =>
          row.layers && !(id === 'isk' && row.needsReauth) ? row.layers[id] : undefined,
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
        sortValue: (row) =>
          row.layers && !row.needsReauth ? netWorthOf(row.layers, shown) : undefined,
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
    [t, mode, lines, hiddenCharacters, hiddenLayers, included.length, shown, listed, coveredIds]
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
      headingRef={headingRef}
      // A drill shows one of the picked Characters while the page header's
      // picker still reads "All characters": the title bar names whose it is.
      meta={
        drilled && single ? (
          <CharacterScopeReadout
            scope="one"
            characterId={single.characterId}
            characterName={single.name}
          />
        ) : undefined
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
          ref={backRef}
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
          <p className={eyebrowClassName}>{t('wallet.netWorth.total')}</p>
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
          // Scrolls sideways under the pinned Character column instead of widening the page.
          <div className="overflow-x-auto">
            <DataTable
              {...tableExport.tableProps}
              label={t('wallet.balanceByCharacter')}
              columns={tableColumns}
              rows={tableRows}
              rowKey={(row) => row.characterId}
              defaultSort={BALANCE_SORT}
              responsive="table"
              rowClassName={() => 'group'}
              onRowClick={(row) => onDrill(row.characterId)}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
