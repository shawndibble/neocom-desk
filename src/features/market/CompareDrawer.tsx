/**
 * Resizable bottom drawer for the Compare Set (CONTEXT.md, round 8): a
 * persistent `Compare (N)` handle, opening a drawer beside the order book
 * rather than covering it — comparing happens *while* browsing, so this is a
 * non-modal overlay, never `Modal`/`<dialog>` (that would inert the order
 * book the user is cross-referencing).
 *
 * Two views (issue #1425): Prices, the order-book summary table below, and
 * Attributes, the dogma matrix folded in from the old
 * `VariationsCompareModal` (`CompareAttributesMatrix.tsx`) — Variations
 * "Compare" now adds its rows to this same Compare Set and requests the
 * drawer open on Attributes (`useCompareSet`'s `openIn`) instead of opening
 * a separate modal that covered the order book.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  resizeHandleTouchClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import { KEYBOARD_OVERLAY_ATTRIBUTE } from '@/lib/shortcuts';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { MarketItemLink } from './MarketItemLink';
import { RemovableTypeIcon } from './RemovableTypeIcon';
import { useCompareSet } from './compareSet';
import { useCompareRows, type CompareRow } from './useCompareRows';
import { useCompareAttributes } from './useCompareAttributes';
import { CompareAttributesMatrix } from './CompareAttributesMatrix';
import type { OrderBookLocation } from './orderBookView';
import { compareCsvColumns } from './compareCsv';
import { formatVolume } from './format';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useCompareAttributesExport } from './useCompareAttributesExport';
import { compareMargin, type AppraisalNetFees } from '@/engine/market/appraisal';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { marketIskDecimals } from '@/lib/isk';

const DRAWER_ID = 'compare-drawer';
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 560;
const DEFAULT_HEIGHT = 280;
const FULL_HEIGHT = '80vh';
const STEP = 24;

/**
 * `md` (48rem), matching this drawer's own phone/desktop split elsewhere in
 * this file (`bottom-16 md:bottom-0`) — not `useIsPhone`'s `sm` threshold,
 * which answers a different question (`useIsPhone.ts`). A third inline copy
 * of this query is fine (`Layout.tsx` ~493, `EntryList.tsx` ~77 each already
 * have their own); there's no shared hook for it.
 */
function isDesktopWidth(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 48rem)').matches;
}

function clampHeight(value: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

const VIEW_LABEL_KEYS = { prices: 'viewPrices', attributes: 'viewAttributes' } as const;

export interface CompareDrawerProps {
  location: OrderBookLocation;
  refreshTick: number;
  /** The active Character, whose skills and `standing` price the after-fees column; null shows no after-fees figure. */
  characterId: number | null;
  /** The Trade Hub the fees are quoted at. */
  hub: TradeHub;
  /** `characterId`'s standing toward `hub`'s NPC station owner. */
  standing: ResolvedStandings;
  /** Where the prices are drawn from — the hub's system, or the chosen Region — named in the header. */
  sourceLabel: string;
}

/** Base-rate stand-in so spread and spread % (which need no fees) still show before the Character's skills load. */
const NO_SKILL_FEES: AppraisalNetFees = {
  accountingLevel: 0,
  brokerRelationsLevel: 0,
  standing: ZERO_STANDINGS,
};

/** Mounted only while the Compare Set is non-empty — see Market.tsx. Unmounting on empty resets the drawer's own open/height state for free. */
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
  // A pending `openRequest` at the very first render means `addMany` +
  // `openIn` already ran in the same synchronous batch that mounted this
  // drawer (a fresh Variations "Compare" click going from an empty Compare
  // Set), so the initial mode is decided here.
  const [mode, setMode] = useState<'closed' | 'open' | 'full'>(() =>
    useCompareSet.getState().openRequest > 0 ? (isDesktopWidth() ? 'open' : 'full') : 'closed'
  );
  const [heightPx, setHeightPx] = useState(DEFAULT_HEIGHT);
  // Below `md` an open drawer is a full-screen sheet, not a resizable strip:
  // a phone has no order book worth keeping in view beside it, and a 280px
  // strip above the bottom nav showed about one item.
  const narrow = useIsNarrow();
  const fullScreen = narrow && mode !== 'closed';
  const handleRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  // Fixed over the page bottom: publish what it covers so focus scrolls clear
  // (WCAG 2.4.11).
  useStickyClearance(wrapperRef, 'compare-drawer');
  // Real bottom space for `main` (Layout.tsx), so the page tail can scroll
  // above the bar. Normally all of the clearance. Desktop Expand covers the
  // page and focus is inside it, so only the handle gets room, not 80vh.
  const expanded = mode === 'full' && !narrow;
  useEffect(() => {
    const rootStyle = document.documentElement.style;
    const handle = handleRef.current;
    if (!expanded || !handle) {
      rootStyle.setProperty('--compare-drawer-space', 'var(--compare-drawer-clearance, 0px)');
      return () => rootStyle.removeProperty('--compare-drawer-space');
    }
    const publish = () => {
      const covered = Math.max(0, window.innerHeight - handle.getBoundingClientRect().top);
      rootStyle.setProperty('--compare-drawer-space', `calc(${covered}px + 0.75rem)`);
    };
    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      rootStyle.removeProperty('--compare-drawer-space');
    };
  }, [expanded]);

  // Every `openIn` is consumed once acted on — the one that mounted this
  // drawer here, later ones in the listener — so a remount after leaving
  // Market doesn't reopen the drawer on a request it already honoured. A
  // later `openIn` (e.g. a second Variations "Compare" click) only opens a
  // *closed* drawer; an already-open one just gets the view switch below, so
  // this never downgrades a manually expanded `full` back to `open`.
  useEffect(() => {
    const store = useCompareSet.getState();
    if (store.openRequest > 0) store.consumeOpenRequest();
    return useCompareSet.subscribe((state, previous) => {
      if (state.openRequest <= previous.openRequest) return;
      state.consumeOpenRequest();
      setMode((current) => (current === 'closed' ? (isDesktopWidth() ? 'open' : 'full') : current));
    });
  }, []);

  const rows = useCompareRows({
    items,
    enabled: mode !== 'closed',
    location,
    refreshTick,
  });
  const [skillLevels, setSkillLevels] = useState<{
    characterId: number;
    accountingLevel: number;
    brokerRelationsLevel: number;
  } | null>(null);
  useEffect(() => {
    if (characterId === null || mode === 'closed') return;
    let cancelled = false;
    void loadCharacterModifiers(characterId, Date.now()).then((modifiers) => {
      if (cancelled) return;
      setSkillLevels({
        characterId,
        accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
        brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, mode]);
  // Null with no Character, or until *their* skills load — a stale
  // previous Character's levels never price this one.
  const fees = useMemo<AppraisalNetFees | null>(
    () =>
      skillLevels !== null && skillLevels.characterId === characterId
        ? { ...skillLevels, standing }
        : null,
    [skillLevels, characterId, standing]
  );
  const attributes = useCompareAttributes(items, mode !== 'closed' && view === 'attributes');
  const pricesCsvColumns = useMemo(() => compareCsvColumns(t), [t]);
  const pricesExport = useTableExport({
    surface: 'market-compare',
    rows,
    columns: pricesCsvColumns,
  });
  const attributesExport = useCompareAttributesExport(rows, attributes.data);

  // One header row on a phone: Clear all joins the export's overflow menu
  // instead of a button of its own that would wrap the header.
  const clearAllMenuItem = narrow ? (
    <MenuItem onSelect={clearSet}>{t('market.compare.clearAll')}</MenuItem>
  ) : undefined;

  // The handle is `inert` under a full-screen sheet, so it can only take
  // focus back once the closed state has rendered.
  const focusHandleOnClose = useRef(false);
  useEffect(() => {
    if (mode !== 'closed' || !focusHandleOnClose.current) return;
    focusHandleOnClose.current = false;
    handleRef.current?.focus();
  }, [mode]);

  // A full-screen sheet takes focus on open — the heading, not Close, whose
  // tooltip would pop open on a programmatic focus — so Tab and Escape start
  // inside it however it opened (the handle, or a Variations "Compare" click).
  useEffect(() => {
    if (fullScreen) headingRef.current?.focus();
  }, [fullScreen]);

  // …and the page behind it is inert: every sibling along the wrapper's
  // ancestor chain, so the sheet's own branch stays live. Only elements this
  // effect set are cleared again.
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
    setMode('closed');
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== 'open') return;
    dragRef.current = { startY: event.clientY, startHeight: heightPx };
    function onMove(moveEvent: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      setHeightPx(clampHeight(drag.startHeight + (drag.startY - moveEvent.clientY)));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (mode !== 'open') return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHeightPx((h) => clampHeight(h + STEP));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHeightPx((h) => clampHeight(h - STEP));
    }
  }

  const marginFor = useCallback(
    (row: CompareRow) => {
      const margin = compareMargin(
        row.summary?.bestSell ?? null,
        row.summary?.bestBuy ?? null,
        fees ?? NO_SKILL_FEES
      );
      // Without the Character's skills the after-fees figure would be a base-rate lie.
      return fees ? margin : { ...margin, afterFees: null };
    },
    [fees]
  );

  const columns = useMemo<DataTableColumn<CompareRow>[]>(
    () => [
      {
        id: 'item',
        header: t('market.compare.columnItem'),
        sortValue: (row) => row.itemName,
        // The "×" on the icon removes the item; the name opens it in the
        // Market (its panel carries the alert and Show Info).
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
          return spreadPct != null ? `${spreadPct.toFixed(1)}%` : '—';
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
    // Fixed-position overlay, not page flow, so `Panel` (DESIGN.md §4) doesn't
    // fit; a plain bordered surface matches its look without the component.
    // `flex-col-reverse` with the handle as the *first* DOM child (below)
    // keeps it visually below the drawer while keeping it before the drawer's
    // content in tab order, so Tab from the handle enters the drawer next.
    // Raised over the bottom nav (`z-40`, Layout.tsx) while full-screen:
    // this wrapper is the stacking context, so the sheet's own z can't.
    <div
      ref={wrapperRef}
      className={`fixed inset-x-0 bottom-16 flex flex-col-reverse items-stretch md:bottom-0 ${fullScreen ? 'z-50' : 'z-30'}`}
    >
      <button
        ref={handleRef}
        type="button"
        // Covered by the full-screen sheet: out of the tab order rather than
        // a focus stop the reader can't see.
        inert={fullScreen}
        aria-expanded={mode !== 'closed'}
        aria-controls={DRAWER_ID}
        onClick={() => setMode((m) => (m === 'closed' ? 'open' : 'closed'))}
        className={`flex ${controlHeightClassName.md} items-center justify-center gap-1.5 border border-line bg-panel px-4 text-[0.6875rem] font-semibold tracking-widest text-text uppercase ${rowInteractiveClassName} ${focusRingInsetClassName}`}
      >
        <Caret expanded={mode !== 'closed'} />
        {t('market.compare.handle', { count: items.length })}
      </button>
      {mode !== 'closed' && (
        <section
          id={DRAWER_ID}
          aria-label={t('market.compare.title')}
          // Owns the keyboard while open — the Escape handler below already
          // assumed that, while the global listener navigated away underneath
          // it. Not a dialog, so it opts in rather than borrowing the role.
          {...{ [KEYBOARD_OVERLAY_ATTRIBUTE]: '' }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          style={fullScreen ? undefined : { height: mode === 'full' ? FULL_HEIGHT : heightPx }}
          className={`flex flex-col border-line bg-panel ${fullScreen ? 'fixed inset-0 h-dvh pb-[env(safe-area-inset-bottom)]' : 'border border-b-0'}`}
        >
          {!fullScreen && (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={t('market.compare.resize')}
              aria-valuenow={mode === 'open' ? heightPx : undefined}
              aria-valuemin={MIN_HEIGHT}
              aria-valuemax={MAX_HEIGHT}
              tabIndex={mode === 'open' ? 0 : -1}
              onPointerDown={startDrag}
              onKeyDown={onHandleKeyDown}
              className={`h-1.5 shrink-0 touch-none border-b border-line ${resizeHandleTouchClassName} ${mode === 'open' ? 'cursor-row-resize hover:bg-panel-2' : ''}`}
            />
          )}
          <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1 md:min-h-9">
            <div className="flex items-center gap-2">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase focus:outline-none"
              >
                {t('market.compare.handle', { count: items.length })}
              </h2>
              {/* An always-visible segmented toggle, not `HistoryViewSelect`'s select-on-desktop
                  pattern: that one earns the select because its two options are
                  a nuance most readers don't know they need (a tooltip explains
                  the distinction); Prices vs Attributes needs no such
                  explanation, so the compact always-visible toggle is right at
                  every width, not just on a phone. */}
              <SegmentedControl
                label={t('market.compare.viewLabel')}
                options={(['prices', 'attributes'] as const).map((option) => ({
                  value: option,
                  label: t(`market.compare.${VIEW_LABEL_KEYS[option]}`),
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
              {view === 'prices' ? (
                <TableActionsMenu name={t('market.compare.viewPrices')} tableExport={pricesExport}>
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
                <>
                  <Button
                    size="sm"
                    onClick={() => setMode((m) => (m === 'full' ? 'open' : 'full'))}
                  >
                    {mode === 'full' ? t('market.compare.restore') : t('market.compare.expand')}
                  </Button>
                  <Button size="sm" onClick={clearSet}>
                    {t('market.compare.clearAll')}
                  </Button>
                </>
              )}
              <IconButton
                size="sm"
                icon={<Icon.Close />}
                label={t('common.close')}
                onClick={close}
              />
            </div>
          </header>
          {/* Both axes on the Attributes view: the matrix's sticky item header
              and pinned attribute column need one scroller to stick to. */}
          <div
            className={`min-h-0 flex-1 ${view === 'attributes' ? 'overflow-auto' : 'overflow-y-auto'}`}
          >
            {view === 'attributes' ? (
              attributes.loading || rows.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Spinner label={t('common.loading')} />
                </div>
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
            ) : rows.length === 0 ? (
              <div className="flex justify-center py-8">
                <Spinner label={t('common.loading')} />
              </div>
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
                <div className="overflow-x-auto">
                  <DataTable
                    {...pricesExport.tableProps}
                    columns={columns}
                    rows={rows}
                    rowKey={(row) => row.typeId}
                    label={t('market.compare.title')}
                    // A compare table: read across columns, so a plain table on a
                    // phone, scrolling sideways with the item pinned.
                    responsive="table"
                  />
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
