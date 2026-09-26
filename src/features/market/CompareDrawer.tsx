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
import {
  Button,
  DataTable,
  EmptyState,
  IconButton,
  IskAmount,
  RowMoreActions,
  SegmentedControl,
  Spinner,
  TypeIcon,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { controlHeightClassName } from '@/components/ui/controlStyles';
import { KEYBOARD_OVERLAY_ATTRIBUTE } from '@/lib/shortcuts';
import { useCompareSet } from './compareSet';
import { useCompareRows, type CompareRow } from './useCompareRows';
import { useCompareAttributes } from './useCompareAttributes';
import { CompareAttributesMatrix } from './CompareAttributesMatrix';
import type { OrderBookLocation } from './orderBookView';
import { compareCsvColumns } from './compareCsv';
import { formatVolume } from './format';
import { downloadCsv } from '@/lib/downloadCsv';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { ItemContextMenu } from './ItemContextMenu';
import { compareMargin, type AppraisalNetFees } from '@/engine/market/appraisal';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { blueprintTypeIdFor } from './useBlueprintCatalog';

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
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
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
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
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
  const handleRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

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

  function close() {
    setMode('closed');
    handleRef.current?.focus();
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
        // The menu wraps only this cell, not the row (unlike sibling surfaces):
        // the row also holds a Remove button, which must not open it.
        render: (row) => (
          <ItemContextMenu
            typeId={row.typeId}
            itemName={row.itemName}
            blueprintTypeID={blueprintTypeIdFor(blueprintCatalog, row.typeId)}
            onAddToQuickbar={onAddToQuickbar}
            quickbarAvailable={quickbarAvailable}
            onShowInfo={onShowInfo}
            onOpenChange={(open) => {
              if (open) onRequestBlueprintCatalog();
            }}
          >
            <span className="flex items-center gap-1.5">
              <TypeIcon typeId={row.typeId} size={32} className="h-4 w-4 shrink-0" />
              <span>{row.itemName}</span>
              <RowMoreActions />
            </span>
          </ItemContextMenu>
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
            <IskAmount value={row.summary.bestSell} revealOn="tap" />
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
            <IskAmount value={row.summary.bestBuy} revealOn="tap" />
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
            <IskAmount value={row.summary.spread} revealOn="tap" />
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
          return afterFees != null ? <IskAmount value={afterFees} revealOn="tap" /> : '—';
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
      {
        id: 'remove',
        header: '',
        align: 'right',
        render: (row) => (
          <Button size="sm" onClick={() => removeItem(row.typeId)}>
            {t('market.compare.remove', { name: row.itemName })}
          </Button>
        ),
      },
    ],
    [
      t,
      marginFor,
      removeItem,
      blueprintCatalog,
      onRequestBlueprintCatalog,
      onAddToQuickbar,
      quickbarAvailable,
      onShowInfo,
    ]
  );

  return (
    // Fixed-position overlay, not page flow, so `Panel` (DESIGN.md §4) doesn't
    // fit; a plain bordered surface matches its look without the component.
    // `flex-col-reverse` with the handle as the *first* DOM child (below)
    // keeps it visually below the drawer while keeping it before the drawer's
    // content in tab order, so Tab from the handle enters the drawer next.
    <div className="fixed inset-x-0 bottom-16 z-30 flex flex-col-reverse items-stretch md:bottom-0">
      <button
        ref={handleRef}
        type="button"
        aria-expanded={mode !== 'closed'}
        aria-controls={DRAWER_ID}
        onClick={() => setMode((m) => (m === 'closed' ? 'open' : 'closed'))}
        className={`flex ${controlHeightClassName.md} items-center justify-center border border-line bg-panel px-4 text-[0.6875rem] font-semibold tracking-widest text-text uppercase hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
      >
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
          style={{ height: mode === 'full' ? FULL_HEIGHT : heightPx }}
          className="flex flex-col border border-b-0 border-line bg-panel"
        >
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
            className={`h-1.5 shrink-0 border-b border-line ${mode === 'open' ? 'cursor-row-resize hover:bg-panel-2' : ''}`}
          />
          <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1 md:min-h-9">
            <div className="flex items-center gap-2">
              <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
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
              {view === 'prices' && (
                <span className="text-[0.6875rem] text-text-dim">
                  {t('market.compare.pricesFrom', { place: sourceLabel })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {view === 'prices' && (
                <IconButton
                  size="sm"
                  icon={<Icon.Download />}
                  label={t('market.compare.exportCsv')}
                  disabled={rows.length === 0}
                  onClick={() => downloadCsv('market-compare', rows, compareCsvColumns(t))}
                />
              )}
              <Button size="sm" onClick={() => setMode((m) => (m === 'full' ? 'open' : 'full'))}>
                {mode === 'full' ? t('market.compare.restore') : t('market.compare.expand')}
              </Button>
              <Button size="sm" onClick={clearSet}>
                {t('market.compare.clearAll')}
              </Button>
              <IconButton
                size="sm"
                icon={<Icon.Close />}
                label={t('common.close')}
                onClick={close}
              />
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                  <CompareAttributesMatrix rows={rows} data={attributes.data} />
                </div>
              )
            ) : rows.length === 0 ? (
              <div className="flex justify-center py-8">
                <Spinner label={t('common.loading')} />
              </div>
            ) : (
              <>
                {fees && (
                  <AssumesBaseStandingsNote
                    className="border-b border-line px-3"
                    hint={t('market.compare.assumesBaseStandingsHint')}
                  />
                )}
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => row.typeId}
                  label={t('market.compare.title')}
                />
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
