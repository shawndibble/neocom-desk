import { fixed1 } from '@/lib/fixedFormat';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStickyClearance } from '@/lib/useStickyClearance';
import {
  Button,
  DataTable,
  EmptyState,
  IconButton,
  IskAmount,
  MenuItem,
  SegmentedControl,
  Spinner,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  controlHeightClassName,
  focusRingInsetClassName,
  grabberClassName,
  resizeHandleTouchClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import { KEYBOARD_OVERLAY_ATTRIBUTE } from '@/lib/shortcuts';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useDrawerResize } from '@/components/ui/useDrawerResize';
import { MarketItemLink } from './MarketItemLink';
import { RemovableTypeIcon } from './RemovableTypeIcon';
import { useCompareSet } from './compareSet';
import { useCompareRows, type CompareRow } from './useCompareRows';
import { useCompareAttributes } from './useCompareAttributes';
import { useCompareHubs } from './useCompareHubs';
import { buildCompareHubRows } from './compareHubsRows';
import { compareHubsCsvColumns } from './compareHubsCsv';
import { TradeHubsTable } from './TradeHubsTable';
import { useHubFor } from './hub';
import { CompareAttributesMatrix } from './CompareAttributesMatrix';
import type { OrderBookLocation } from './orderBookView';
import { compareCsvColumns } from './compareCsv';
import { formatVolume } from './format';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useCompareAttributesExport } from './useCompareAttributesExport';
import { compareMargin, type AppraisalNetFees } from '@/engine/market/appraisal';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { marketIskDecimals } from '@/lib/isk';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { TableScroll } from '@/components/ui/TableScroll';

const DRAWER_ID = 'compare-drawer';
const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 280;
const STEP = 24;
const MAX_HEIGHT_FRACTION = 0.8;

const VIEW_LABEL_KEYS = {
  prices: 'viewPrices',
  hubs: 'viewHubs',
  attributes: 'viewAttributes',
} as const;

export interface CompareDrawerProps {
  location: OrderBookLocation;
  refreshTick: number;
  characterId: number | null;
  hub: TradeHub;
  standing: ResolvedStandings;
  sourceLabel: string;
}

const NO_SKILL_FEES: AppraisalNetFees = {
  accountingLevel: 0,
  brokerRelationsLevel: 0,
  standing: ZERO_STANDINGS,
};

export function CompareDrawer({
  location,
  refreshTick,
  characterId,
  standing,
  sourceLabel,
}: CompareDrawerProps) {
  const { t } = useTranslation();
  const items = useCompareSet((state) => state.items);
  const removeItem = useCompareSet((state) => state.remove);
  const clearSet = useCompareSet((state) => state.clear);
  const view = useCompareSet((state) => state.view);
  const setView = useCompareSet((state) => state.setView);
  const [open, setOpen] = useState(() => useCompareSet.getState().openRequest > 0);
  const narrow = useIsNarrow();
  const fullScreen = narrow && open;
  const handleRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resize = useDrawerResize({
    min: MIN_HEIGHT,
    initial: DEFAULT_HEIGHT,
    step: STEP,
    maxFraction: MAX_HEIGHT_FRACTION,
    onDismiss: () => close(),
    enabled: open && !fullScreen,
  });
  useStickyClearance(wrapperRef, 'compare-drawer');
  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--compare-drawer-space', 'var(--compare-drawer-clearance, 0px)');
    return () => {
      rootStyle.removeProperty('--compare-drawer-space');
    };
  }, []);

  useEffect(() => {
    const store = useCompareSet.getState();
    if (store.openRequest > 0) store.consumeOpenRequest();
    return useCompareSet.subscribe((state, previous) => {
      if (state.openRequest <= previous.openRequest) return;
      state.consumeOpenRequest();
      setOpen(true);
    });
  }, []);

  const rows = useCompareRows({
    items,
    enabled: open,
    location,
    refreshTick,
  });
  const loadSkillLevels = useCallback(
    () =>
      loadCharacterModifiers(characterId ?? 0, Date.now()).then((modifiers) => ({
        accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
        brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
      })),
    [characterId]
  );
  const skillLevels = useKeyedLoad(
    characterId === null ? null : String(characterId),
    loadSkillLevels,
    !open
  ).data;
  const fees = useMemo<AppraisalNetFees | null>(
    () => (skillLevels !== undefined ? { ...skillLevels, standing } : null),
    [skillLevels, standing]
  );
  const attributes = useCompareAttributes(items, open && view === 'attributes');
  const attributesExport = useCompareAttributesExport(rows, attributes.data);
  const { hubId: ownHubId } = useHubFor('market');
  const ownHubName = TRADE_HUBS.find((candidate) => candidate.id === ownHubId)?.systemName ?? '';
  const hubsData = useCompareHubs(items, open && view === 'hubs', refreshTick);
  const hubRows = useMemo(() => buildCompareHubRows(items, hubsData), [items, hubsData]);
  const hubsCsvColumns = useMemo(
    () => compareHubsCsvColumns(t, { jumps: hubsData.jumps, ownHub: ownHubId }),
    [t, hubsData.jumps, ownHubId]
  );
  const hubsExport = useTableExport({
    surface: 'market-compare-hubs',
    rows: hubRows,
    columns: hubsCsvColumns,
  });

  const clearAllMenuItem = narrow ? (
    <MenuItem onSelect={clearSet}>{t('market.compare.clearAll')}</MenuItem>
  ) : undefined;

  const focusHandleOnClose = useRef(false);
  useEffect(() => {
    if (open || !focusHandleOnClose.current) return;
    focusHandleOnClose.current = false;
    handleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (fullScreen) headingRef.current?.focus();
  }, [fullScreen]);

  useEffect(() => {
    if (!fullScreen) return;
    const marked: Element[] = [];
    for (
      let node: HTMLElement | null = wrapperRef.current;
      node && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling === node || sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
    return () => {
      for (const element of marked) element.removeAttribute('inert');
    };
  }, [fullScreen]);

  function close() {
    focusHandleOnClose.current = true;
    setOpen(false);
  }

  const marginFor = useCallback(
    (row: CompareRow) => {
      const margin = compareMargin(
        row.summary?.bestSell ?? null,
        row.summary?.bestBuy ?? null,
        fees ?? NO_SKILL_FEES
      );
      return fees ? margin : { ...margin, afterFees: null };
    },
    [fees]
  );

  const pricesCsvColumns = useMemo(() => compareCsvColumns(t, marginFor), [t, marginFor]);
  const pricesExport = useTableExport({
    surface: 'market-compare',
    rows,
    columns: pricesCsvColumns,
  });
  const columns = useMemo<DataTableColumn<CompareRow>[]>(
    () => [
      {
        id: 'item',
        header: t('market.compare.columnItem'),
        sortValue: (row) => row.itemName,
        stickyStart: true,
        render: (row) => (
          <span className="flex items-center gap-2.5">
            <RemovableTypeIcon
              typeId={row.typeId}
              itemName={row.itemName}
              onRemove={removeItem}
              sizeClassName="size-6"
            />
            <MarketItemLink typeId={row.typeId}>{row.itemName}</MarketItemLink>
          </span>
        ),
      },
      {
        id: 'bestSell',
        header: t('market.compare.columnBestSell'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) =>
          row.loading ? (
            '…'
          ) : row.summary?.bestSell != null ? (
            <IskAmount
              value={row.summary.bestSell}
              decimals={marketIskDecimals(row.summary.bestSell)}
            />
          ) : (
            '—'
          ),
        sortFirst: 'asc',
        sortValue: (row) => row.summary?.bestSell ?? undefined,
      },
      {
        id: 'bestBuy',
        header: t('market.compare.columnBestBuy'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) =>
          row.loading ? (
            '…'
          ) : row.summary?.bestBuy != null ? (
            <IskAmount
              value={row.summary.bestBuy}
              decimals={marketIskDecimals(row.summary.bestBuy)}
            />
          ) : (
            '—'
          ),
        sortValue: (row) => row.summary?.bestBuy ?? undefined,
      },
      {
        id: 'spread',
        header: t('market.compare.columnSpread'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) =>
          row.loading ? (
            '…'
          ) : row.summary?.spread != null ? (
            <IskAmount
              value={row.summary.spread}
              decimals={marketIskDecimals(row.summary.spread)}
            />
          ) : (
            '—'
          ),
        sortValue: (row) => row.summary?.spread ?? undefined,
      },
      {
        id: 'spreadPct',
        header: t('market.compare.columnSpreadPct'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => {
          if (row.loading) return '…';
          const { spreadPct } = marginFor(row);
          return spreadPct != null ? `${fixed1(spreadPct)}%` : '—';
        },
        sortValue: (row) => marginFor(row).spreadPct ?? undefined,
      },
      {
        id: 'afterFees',
        header: t('market.compare.columnAfterFees'),
        headerTooltip: t('market.compare.columnAfterFeesHelp'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => {
          if (row.loading) return '…';
          const { afterFees } = marginFor(row);
          return afterFees != null ? (
            <IskAmount value={afterFees} decimals={marketIskDecimals(afterFees)} />
          ) : (
            '—'
          );
        },
        sortValue: (row) => marginFor(row).afterFees ?? undefined,
      },
      {
        id: 'volume',
        header: t('market.compare.columnVolume'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => (row.loading ? '…' : formatVolume(row.summary?.availableVolume ?? 0)),
        sortValue: (row) => row.summary?.availableVolume ?? undefined,
      },
    ],
    [t, marginFor, removeItem]
  );

  return (
    <div
      ref={wrapperRef}
      className={`fixed inset-x-0 bottom-16 flex flex-col-reverse items-stretch md:bottom-0 ${fullScreen ? 'z-50' : 'z-30'}`}
    >
      <button
        ref={handleRef}
        type="button"
        inert={fullScreen}
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        onClick={() => {
          if (!open && items.length === 1 && view === 'prices') setView('hubs');
          setOpen((current) => !current);
        }}
        className={`flex ${controlHeightClassName.md} items-center justify-center gap-1.5 border border-line bg-panel px-4 text-[0.6875rem] font-semibold tracking-widest text-text uppercase ${rowInteractiveClassName} ${focusRingInsetClassName}`}
      >
        <Caret expanded={open} />
        {t('market.compare.handle', { count: items.length })}
      </button>
      {open && (
        <section
          id={DRAWER_ID}
          aria-label={t('market.compare.title')}
          {...{ [KEYBOARD_OVERLAY_ATTRIBUTE]: '' }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          style={fullScreen ? undefined : resize.style}
          className={`flex flex-col border-line bg-panel ${fullScreen ? 'motion-rise-full fixed inset-0 h-dvh pb-[env(safe-area-inset-bottom)]' : 'motion-rise border border-b-0'}`}
        >
          {!fullScreen && (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={t('market.compare.resize')}
              aria-valuenow={resize.height}
              aria-valuemin={MIN_HEIGHT}
              aria-valuemax={resize.max}
              tabIndex={0}
              {...resize.dragProps}
              onKeyDown={resize.onKeyDown}
              className={cx(
                'flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-center border-b border-line hover:bg-panel-2',
                focusRingInsetClassName,
                resizeHandleTouchClassName
              )}
            >
              <span aria-hidden="true" className={grabberClassName} />
            </div>
          )}
          <header
            {...(fullScreen ? {} : resize.dragProps)}
            className={cx(
              'flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1',
              !fullScreen && 'touch-none'
            )}
          >
            <div className="flex items-center gap-2">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className={cx(eyebrowClassName, 'focus:outline-none')}
              >
                {t('market.compare.handle', { count: items.length })}
              </h2>
              <SegmentedControl
                label={t('market.compare.viewLabel')}
                options={(['prices', 'hubs', 'attributes'] as const).map((option) => ({
                  value: option,
                  label: t(
                    `market.compare.${option === 'hubs' && narrow ? 'viewHubsShort' : VIEW_LABEL_KEYS[option]}`
                  ),
                }))}
                value={view}
                onChange={setView}
              />
              {view === 'prices' && !narrow && (
                <span className="text-[0.6875rem] text-text-dim">
                  {t('market.compare.pricesFrom', { place: sourceLabel })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {view === 'hubs' && !narrow && (
                <span className="text-[0.6875rem] text-text-dim">
                  {t('market.compare.hubsSubtitle', { hub: ownHubName })}
                </span>
              )}
              {view === 'prices' ? (
                <TableActionsMenu name={t('market.compare.viewPrices')} tableExport={pricesExport}>
                  {clearAllMenuItem}
                </TableActionsMenu>
              ) : view === 'hubs' ? (
                <TableActionsMenu name={t('market.compare.viewHubs')} tableExport={hubsExport}>
                  {clearAllMenuItem}
                </TableActionsMenu>
              ) : (
                attributes.data && (
                  <TableActionsMenu
                    name={t('market.compare.viewAttributes')}
                    tableExport={attributesExport}
                  >
                    {clearAllMenuItem}
                  </TableActionsMenu>
                )
              )}
              {!narrow && (
                <Button size="sm" onClick={clearSet}>
                  {t('market.compare.clearAll')}
                </Button>
              )}
              <IconButton
                size="sm"
                icon={<Icon.Close />}
                label={t('common.close')}
                onClick={close}
              />
            </div>
          </header>
          <div
            className={`min-h-0 flex-1 ${view === 'attributes' ? 'overflow-auto' : 'overflow-y-auto'}`}
          >
            {view === 'attributes' ? (
              attributes.loading || rows.length === 0 ? (
                <Spinner block="panel" label={t('common.loading')} />
              ) : attributes.error || !attributes.data ? (
                <EmptyState
                  title={t('market.compare.errorTitle')}
                  hint={t('market.compare.errorHint')}
                  className="py-8"
                />
              ) : (
                <div className="p-3">
                  <CompareAttributesMatrix
                    rows={rows}
                    data={attributes.data}
                    tableExport={attributesExport}
                    onRemove={removeItem}
                  />
                </div>
              )
            ) : view === 'hubs' ? (
              <>
                {narrow && (
                  <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                    {t('market.compare.hubsSubtitle', { hub: ownHubName })}
                  </p>
                )}
                <TableScroll>
                  <TradeHubsTable
                    rows={hubRows}
                    jumps={hubsData.jumps}
                    ownHub={ownHubId}
                    tableExport={hubsExport}
                    onRemove={removeItem}
                  />
                </TableScroll>
              </>
            ) : rows.length === 0 ? (
              <Spinner block="panel" label={t('common.loading')} />
            ) : (
              <>
                {narrow && (
                  <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                    {t('market.compare.pricesFrom', { place: sourceLabel })}
                  </p>
                )}
                {fees && (
                  <AssumesBaseStandingsNote
                    className="border-b border-line px-3"
                    hint={t('market.compare.assumesBaseStandingsHint')}
                  />
                )}
                <TableScroll>
                  <DataTable
                    {...pricesExport.tableProps}
                    columns={columns}
                    rows={rows}
                    rowKey={(row) => row.typeId}
                    label={t('market.compare.title')}
                    responsive="table"
                  />
                </TableScroll>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
