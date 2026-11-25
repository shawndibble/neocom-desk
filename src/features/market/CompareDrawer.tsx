/**
 * Drag-resized bottom drawer for the Compare Set (GLOSSARY.md, round 8): a
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
import { fixed1 } from '@/lib/fixedFormat';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
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
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { SWIPE_DISMISS_DISTANCE } from '@/components/ui/useSheetSwipe';
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

const DRAWER_ID = 'compare-drawer';
const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 280;
/** One arrow-key press of height. */
const STEP = 24;
/**
 * Tallest the grip can drag the drawer, as a share of the viewport — where the
 * Expand button used to jump it, so dragging still reaches everywhere the
 * button did (decision `20261125-211649-compare-drawer-is-dragged-to-size-with-no`).
 */
const MAX_HEIGHT_FRACTION = 0.8;

/**
 * Tallest the drawer may be drawn right now. Viewport-derived rather than the
 * fixed 560px ceiling this replaced: a fixed number either stops well short of
 * a tall monitor or, in a short window, lets the drawer cover its own handle.
 */
function maxHeight(): number {
  if (typeof window === 'undefined') return MIN_HEIGHT;
  return Math.max(MIN_HEIGHT, Math.round(window.innerHeight * MAX_HEIGHT_FRACTION));
}

function clampHeight(value: number, max: number): number {
  return Math.min(max, Math.max(MIN_HEIGHT, value));
}

const VIEW_LABEL_KEYS = {
  prices: 'viewPrices',
  hubs: 'viewHubs',
  attributes: 'viewAttributes',
} as const;

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
  // Set), so it opens already open.
  const [open, setOpen] = useState(() => useCompareSet.getState().openRequest > 0);
  const [heightPx, setHeightPx] = useState(DEFAULT_HEIGHT);
  const [maxPx, setMaxPx] = useState(maxHeight);
  // How far a drag has pulled the drawer past `MIN_HEIGHT`: it stops shrinking
  // there and slides toward the bottom edge by this much instead, so one
  // gesture covers "shorter" and "away" (§6c) without an Expand button.
  const [pulled, setPulled] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  // Below `md` an open drawer is a full-screen sheet, not a resizable strip:
  // a phone has no order book worth keeping in view beside it, and a 280px
  // strip above the bottom nav showed about one item.
  const narrow = useIsNarrow();
  const fullScreen = narrow && open;
  const handleRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Removes the in-flight drag's window listeners — called on release, and on
  // unmount for a drag the drawer never saw the end of.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  // The ceiling follows the viewport, and a window shrunk under the current
  // height brings the drawer down with it rather than leaving it off screen.
  useEffect(() => {
    const onResize = () => {
      const max = maxHeight();
      setMaxPx(max);
      setHeightPx((h) => clampHeight(h, max));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Fixed over the page bottom: publish what it covers so focus scrolls clear
  // (WCAG 2.4.11).
  useStickyClearance(wrapperRef, 'compare-drawer');
  // Real bottom space for `main` (Layout.tsx), so the page tail can scroll
  // above the bar — but capped at the handle plus a default-height drawer.
  // Dragging is free now, and reserving 80vh of empty page below the content
  // for a drawer the reader has deliberately pulled over it is not what they
  // asked for. `min()` saturates rather than switching at a threshold, so the
  // page never re-lays-out mid-drag the way the old Expand mode made it.
  useEffect(() => {
    const rootStyle = document.documentElement.style;
    const publish = () => {
      const handle = handleRef.current;
      const covered = handle
        ? Math.max(0, window.innerHeight - handle.getBoundingClientRect().top)
        : 0;
      rootStyle.setProperty(
        '--compare-drawer-space',
        `min(var(--compare-drawer-clearance, 0px), calc(${covered + DEFAULT_HEIGHT}px + 0.75rem))`
      );
    };
    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      rootStyle.removeProperty('--compare-drawer-space');
    };
  }, []);

  // Every `openIn` is consumed once acted on — the one that mounted this
  // drawer here, later ones in the listener — so a remount after leaving
  // Market doesn't reopen the drawer on a request it already honoured. A
  // later `openIn` (e.g. a second Variations "Compare" click) opens a closed
  // drawer and otherwise only switches the view below — it never resets a
  // height the reader has dragged.
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
  // Null with no Character, or until *their* skills load — a stale
  // previous Character's levels never price this one.
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

  // One header row on a phone: Clear all joins the export's overflow menu
  // instead of a button of its own that would wrap the header.
  const clearAllMenuItem = narrow ? (
    <MenuItem onSelect={clearSet}>{t('market.compare.clearAll')}</MenuItem>
  ) : undefined;

  // The handle is `inert` under a full-screen sheet, so it can only take
  // focus back once the closed state has rendered.
  const focusHandleOnClose = useRef(false);
  useEffect(() => {
    if (open || !focusHandleOnClose.current) return;
    focusHandleOnClose.current = false;
    handleRef.current?.focus();
  }, [open]);

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
    setOpen(false);
  }

  /**
   * The grip's drag: up and down sets any height between `MIN_HEIGHT` and the
   * viewport ceiling, and carrying the pull `SWIPE_DISMISS_DISTANCE` past the
   * minimum closes the drawer on release — the same 80px commit a sheet swipe
   * uses, so the one gesture both resizes and dismisses. No velocity test: a
   * sheet's flick is a thumb gesture, while this grip is aimed with a mouse,
   * where a deliberate overshoot reads better than a fast one. The arrow keys
   * below, the ✕, Escape and the handle all remain, so neither the resize nor
   * the dismissal is drag-only (WCAG 2.5.7).
   */
  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const drag = { startY: event.clientY, startHeight: heightPx, max: maxPx, pulled: 0 };
    setDragging(true);
    function detach() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      endDragRef.current = null;
    }
    function onMove(moveEvent: PointerEvent) {
      const raw = drag.startHeight + (drag.startY - moveEvent.clientY);
      drag.pulled = Math.max(0, MIN_HEIGHT - raw);
      setHeightPx(clampHeight(raw, drag.max));
      setPulled(drag.pulled);
    }
    function onUp() {
      detach();
      setDragging(false);
      setPulled(0);
      if (drag.pulled >= SWIPE_DISMISS_DISTANCE) close();
    }
    endDragRef.current = detach;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /** The non-dragging path to every height the grip can reach. */
  function onHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const resize = (next: number) => {
      event.preventDefault();
      setHeightPx(clampHeight(next, maxPx));
    };
    if (event.key === 'ArrowUp') resize(heightPx + STEP);
    else if (event.key === 'ArrowDown') resize(heightPx - STEP);
    else if (event.key === 'Home') resize(MIN_HEIGHT);
    else if (event.key === 'End') resize(maxPx);
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
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        onClick={() => {
          // Prices for a lone item compares nothing, so opening lands on Trade hubs
          // (a view the user picked on purpose stays).
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
          style={
            fullScreen
              ? undefined
              : {
                  height: heightPx,
                  // Follows the pointer with no transition while the grip is
                  // held; the snap back after a pull that didn't commit is
                  // animated, and reduced motion takes neither.
                  transform: pulled > 0 ? `translateY(${pulled}px)` : undefined,
                  transition:
                    dragging || reducedMotion ? 'none' : 'transform 240ms var(--motion-ease-out)',
                }
          }
          className={`flex flex-col border-line bg-panel ${fullScreen ? 'motion-rise-full fixed inset-0 h-dvh pb-[env(safe-area-inset-bottom)]' : 'motion-rise border border-b-0'}`}
        >
          {!fullScreen && (
            // The visible grip §6c's drag rule requires, and now the only
            // pointer path to the drawer's height: a sheet's grabber mark on a
            // band wide enough to aim at with a mouse, growing to a 36px one on
            // touch (`resizeHandleTouchClassName`). Focusable, so it carries
            // the shared focus ring.
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={t('market.compare.resize')}
              aria-valuenow={heightPx}
              aria-valuemin={MIN_HEIGHT}
              aria-valuemax={maxPx}
              tabIndex={0}
              onPointerDown={startDrag}
              onKeyDown={onHandleKeyDown}
              className={`flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center border-b border-line hover:bg-panel-2 ${focusRingInsetClassName} ${resizeHandleTouchClassName}`}
            >
              <span aria-hidden="true" className="h-1 w-10 rounded-full bg-line-bright" />
            </div>
          )}
          <header className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1">
            <div className="flex items-center gap-2">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className={cx(eyebrowClassName, 'focus:outline-none')}
              >
                {t('market.compare.handle', { count: items.length })}
              </h2>
              {/* An always-visible segmented toggle, not a select: Prices vs
                  Attributes needs no explanation, so the compact toggle is
                  right at every width, not just on a phone. */}
              <SegmentedControl
                label={t('market.compare.viewLabel')}
                options={(['prices', 'hubs', 'attributes'] as const).map((option) => ({
                  value: option,
                  // "Trade hubs" would push Attributes off a phone header.
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
          {/* Both axes on the Attributes view: the matrix's sticky item header
              and pinned attribute column need one scroller to stick to. */}
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
                <div className="overflow-x-auto">
                  <TradeHubsTable
                    rows={hubRows}
                    jumps={hubsData.jumps}
                    ownHub={ownHubId}
                    tableExport={hubsExport}
                    onRemove={removeItem}
                  />
                </div>
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
