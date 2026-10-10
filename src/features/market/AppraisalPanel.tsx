/**
 * The Market page's Appraisal tab: paste a pile of items, read what it is
 * worth on both sides of a Trade Hub's order book.
 *
 * The paste box stays beside the ledger rather than collapsing once a result
 * exists — an appraisal is usually edited two or three times (a line typo, a
 * stack left out), and a list you can still see is a list you can still fix.
 * That is also where unmatched lines are reported, next to the text they
 * refer to. Below `lg` the paste card sits above the result instead of
 * beside it and would push the answer a screen down, so there (and only once
 * a result exists) it folds into a one-line "N lines · Edit list" summary;
 * the unmatched report stays visible and the list is one tap away.
 *
 * The Browser's own two-column grid holds two halves: the paste box, one
 * `Panel`, narrower on the left since it does not need the width the Market
 * Group tree does; and the result column, which stacks the primary result
 * `Panel` above an optional, foldable Compare Hubs section once something
 * has been appraised.
 */
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  IconButton,
  MenuItem,
  IskAmount,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  TextArea,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { Caret } from '@/components/ui/Disclosure';
import { HintText } from '@/components/ui/HintText';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { subtractOwned, type WithOwned } from '@/engine/market/appraisalOwned';
import { formatAge } from '@/lib/age';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import {
  appraisalNet,
  lpBeatsMarket,
  refineBeatsSellAsIs,
  type AppraisalRow,
} from '@/engine/market/appraisal';
import { countPasteLines, pasteBoxRows } from '@/engine/market/appraisalPaste';
import {
  appraisalSnapshotReuseKey,
  buildAppraisalSnapshot,
  MAX_SNAPSHOT_ITEMS,
} from '@/engine/market/appraisalSnapshot';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { EsiEndpointId } from '@/esi/registry';

import { isSyncConfigured } from '@/app/syncStatus';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { LpStoreLink } from '@/features/loyalty/LpStoreLink';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIskAuto } from '@/lib/isk';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import {
  APPRAISAL_COLUMN_IDS,
  DEFAULT_VISIBLE_APPRAISAL_COLUMNS,
  useVisibleAppraisalColumns,
  type AppraisalColumnId,
} from './appraisalColumns';
import { appraisalCsvColumns } from './appraisalCsv';
import { appraisalSellGroups } from '@/engine/market/appraisalSellGroups';
import { appraisalMultibuyText } from './appraisalMultibuyText';
import { useAppraisalOwnedPref } from './appraisalOwnedPref';
import { recentLabel, useRecentAppraisals } from './appraisalRecent';

// Reserved Select value for the action item; real entries use their list index.
const CLEAR_RECENT = 'clear';
import { appraisalSellListText } from './appraisalSellListText';
import { AppraisalHeaderStats } from './AppraisalHeaderStats';
import { AppraisalHoldBar } from './AppraisalHoldBar';
import { useHaulingCargo } from './haulingCargo';
import { useOwnedAtStation } from './useOwnedAtStation';
import { appraisalVolumeColumn } from './appraisalVolume';
import { formatVolume } from './format';
import { HubCompareCards } from './HubCompareCards';
import { ItemContextMenu } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import { isValidPricePercent, MAX_PRICE_PERCENT, MIN_PRICE_PERCENT } from './pricePercent';
import type { AppraisalController } from './useAppraisal';

const ASSETS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterAssets'];

type OwnedRow = AppraisalRow & Partial<Pick<WithOwned<AppraisalRow>, 'owned' | 'need'>>;

interface AppraisalPanelProps {
  controller: AppraisalController;
  pricePercent: number;
  onPricePercentChange: (value: number) => void;
  /** The hub the figures are quoted at — the panel's own provenance chip, and what a Share Link is stored against. */
  hub: TradeHub;
  onHubChange: (id: TradeHub['id']) => void;
  /** The active Character's standing toward this hub's NPC station owner, for the net-of-fees chips' broker fee. */
  standing: ResolvedStandings;
  /** Signs in to store a Share Link as this Character if no Firebase session exists yet; null disables Share. */
  characterId: number | null;
  /** Opens the Compare Hubs panel already expanded — the Quickbar's "View in Appraisal" action (#726) lands directly on the multi-hub view rather than a collapsed one. */
  defaultCompareExpanded?: boolean;
}

type CopyList = 'sellNow' | 'list' | 'refine' | 'multibuy';

/** Menu order: the three ways out of the pile, then the way in. */
const COPY_LISTS: readonly CopyList[] = ['sellNow', 'list', 'refine', 'multibuy'];

/** A copy list's line count and text; an empty one has neither, and its menu item is disabled. */
function copyListOf<T>(items: readonly T[], toText: (items: readonly T[]) => string) {
  const text = toText(items);
  return { count: text === '' ? 0 : text.split('\n').length, text };
}

/**
 * A per-unit price, exact. A missing price is a dash, never a zero — the house
 * placeholder. Stays on `formatIskAuto` rather than shorthand: an each-price
 * runs from a 5 ISK mineral to a billion-ISK hull, and compact notation rounds
 * the cheap end (4.99 and 5.01 both render "5") into nonsense.
 */
function eachCell(value: number | null): string {
  if (value === null) return '—';
  return formatIskAuto(value);
}

/** A line or hub total as scannable shorthand, exact value one gesture away. */
function totalCell(value: number | null): ReactNode {
  if (value === null) return '—';
  return <IskAmount value={value} decimals={0} />;
}

/**
 * The Share button's progress. `manual` is a link that was stored but could
 * not be copied: the save took long enough that the browser no longer counts
 * the copy as part of the click (Safari is strict about this), so the link is
 * shown for a second, in-gesture copy instead of being lost.
 */
type ShareState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'failed' }
  | { status: 'copied'; url: string }
  | { status: 'manual'; url: string };

/** Refine wins only because the leftover units sell on top; the refine total alone is below buy total. */
function leftoverTipsRefine(row: AppraisalRow) {
  return (
    refineBeatsSellAsIs(row) &&
    (row.refineUnitsLeftOver ?? 0) > 0 &&
    row.refineTotal !== undefined &&
    row.buyTotal !== null &&
    row.refineTotal <= row.buyTotal
  );
}

/** Bolds a total only when it actually won a real comparison — never on a row with nothing to compare against. */
function comparisonCell(
  total: ReactNode,
  highlighted: boolean,
  suffix?: ReactElement | false,
  prefix?: ReactElement | false
) {
  return (
    <span className={highlighted ? 'font-semibold text-isk-pos' : undefined}>
      {prefix}
      {total}
      {suffix}
    </span>
  );
}

/** `lg` up to (not including) `xl`: paste card and results share a row but the results card is narrow. A min-and-max pair never matches under the test `matchMedia` stub, so tests see the full default. */
const COMPACT_RESULTS_QUERY = '(min-width: 64rem) and (max-width: 79.999rem)';
const COMPACT_OFF_BY_DEFAULT: readonly AppraisalColumnId[] = ['buyEach', 'sellEach', 'volume'];

export function AppraisalPanel({
  controller,
  pricePercent,
  onPricePercentChange,
  hub,
  onHubChange,
  standing,
  characterId,
  defaultCompareExpanded = false,
}: AppraisalPanelProps) {
  const { t } = useTranslation();
  const { text, setText, result, compare, loading, failed } = controller;
  const [compareExpanded, setCompareExpanded] = useState(defaultCompareExpanded);
  // Phone only: the pilot opened the folded paste card to edit the list. The
  // result of an Appraise (or a Recent pick) from the open form folds it
  // again, adjusted during render like the idioms below. A re-price from a
  // changed Price % or hub also lands a new result, but must not pull the form
  // out from under someone mid-typing, hence the explicit request flag.
  const isDesktop = useIsDesktop();
  const [editingList, setEditingList] = useState(false);
  const [foldOnResult, setFoldOnResult] = useState(false);
  const [foldedFor, setFoldedFor] = useState(result);
  // The fold unmounts the focused Appraise button; below `lg` the Result heading
  // takes focus instead (WCAG 2.4.3), which also announces the result.
  const [focusResultTick, setFocusResultTick] = useState(0);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  if (result !== foldedFor) {
    setFoldedFor(result);
    if (foldOnResult) {
      setFoldOnResult(false);
      setEditingList(false);
      if (!isDesktop) setFocusResultTick((n) => n + 1);
    }
  }
  useEffect(() => {
    if (focusResultTick > 0) focusAfterCommit(resultHeadingRef);
  }, [focusResultTick, focusAfterCommit]);
  function appraiseFromForm(run: () => void) {
    setFoldOnResult(true);
    run();
  }
  const focusListOnOpen = useRef(false);
  useEffect(() => {
    if (!editingList || !focusListOnOpen.current) return;
    focusListOnOpen.current = false;
    document.getElementById('market-appraisal-text')?.focus();
  }, [editingList]);
  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  // A link belongs to the result it was made from; a new appraisal drops it.
  const [shareResult, setShareResult] = useState(result);
  if (result !== shareResult) {
    setShareResult(result);
    setShare({ status: 'idle' });
  }
  const [copied, setCopied] = useState<{ list: CopyList; count: number } | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  const hubName = hub.systemName;

  // Ages in the Recent list are read against when the panel opened.
  const [openedAt] = useState(Date.now);
  const recent = useRecentAppraisals((state) => state.value);
  const hydrateRecent = useRecentAppraisals((state) => state.hydrate);
  const setRecent = useRecentAppraisals((state) => state.setValue);
  const ownedPref = useAppraisalOwnedPref((state) => state.value);
  const hydrateOwnedPref = useAppraisalOwnedPref((state) => state.hydrate);
  const setOwnedPref = useAppraisalOwnedPref((state) => state.setValue);
  const cargo = useHaulingCargo((state) => state.value);
  const hydrateCargo = useHaulingCargo((state) => state.hydrate);
  useEffect(() => {
    void hydrateRecent();
    void hydrateOwnedPref();
    void hydrateCargo();
  }, [hydrateRecent, hydrateOwnedPref, hydrateCargo]);

  const lacksAssets = useCharacterLacksEndpoints(characterId, ASSETS_ENDPOINTS);
  const minusOwned = ownedPref.enabled && !lacksAssets && characterId !== null;
  const ownedStationId = ownedPref.stationId ?? hub.stationId;
  const ownedStation = TRADE_HUBS.find((h) => h.stationId === ownedStationId) ?? hub;
  const { owned } = useOwnedAtStation(minusOwned, ownedStationId);

  const storedColumns = useVisibleAppraisalColumns((state) => state.value);
  // Side by side below `xl` the results card is only ~500px wide, so with no
  // stored selection the per-unit price and volume columns start unticked (the totals and the Cargo group say
  // the same thing) rather than pushing the row menu out of reach. Only a
  // default: ticking one shows it, and a stored selection is read as saved.
  const compactResults = useMediaQuery(COMPACT_RESULTS_QUERY);
  const visibleColumns =
    compactResults && storedColumns === DEFAULT_VISIBLE_APPRAISAL_COLUMNS
      ? DEFAULT_VISIBLE_APPRAISAL_COLUMNS.filter((id) => !COMPACT_OFF_BY_DEFAULT.includes(id))
      : storedColumns;
  const setVisibleColumns = useVisibleAppraisalColumns((state) => state.setValue);
  const hydrateVisibleColumns = useVisibleAppraisalColumns((state) => state.hydrate);
  useEffect(() => {
    void hydrateVisibleColumns();
  }, [hydrateVisibleColumns]);
  function toggleColumn(id: AppraisalColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    void setVisibleColumns(next);
  }

  /**
   * Stores the appraisal as it stands — prices included — and copies its short
   * `/s/<id>` link. The same appraisal shared again gets the same link, and
   * a failed save copies nothing.
   */
  async function handleShare() {
    if (!result || characterId === null || share.status === 'saving') return;
    const snapshot = buildAppraisalSnapshot({
      hub: hub.id,
      pricePercent,
      generatedAt: Math.floor(Date.now() / 1000),
      items: result.appraisal.items,
    });
    if (!snapshot.ok) return; // pre-checked by the disabled state below
    const reuseKey = appraisalSnapshotReuseKey(snapshot.value);
    // A link already made copies with no await first, so it stays inside the click.
    let url = existingShareLink('appraisal', reuseKey);
    if (url === null) {
      setShare({ status: 'saving' });
      try {
        url = await createShareLink({
          type: 'appraisal',
          payload: snapshot.value,
          reuseKey,
          characterId,
        });
      } catch {
        setShare({ status: 'failed' });
        return;
      }
    }
    try {
      await writeToClipboard(url);
      setShare({ status: 'copied', url });
    } catch {
      setShare({ status: 'manual', url });
    }
  }

  async function handleCopyShareUrl(url: string) {
    try {
      await writeToClipboard(url);
      setShare({ status: 'copied', url });
    } catch {
      // Still on screen to copy by hand.
    }
  }

  const shareItemCount = result?.appraisal.items.length ?? 0;

  const sellGroups = useMemo(
    () => (result === null ? null : appraisalSellGroups(result.appraisal)),
    [result]
  );

  const multibuyItems = useMemo(() => {
    const items = result?.appraisal.items ?? [];
    return owned ? subtractOwned(items, owned) : items;
  }, [result, owned]);

  /** Each list's items and clipboard text; an empty list has no text and its menu item is disabled. */
  const copyLists: Record<CopyList, { count: number; text: string }> = {
    sellNow: copyListOf(sellGroups?.sellNow ?? [], appraisalMultibuyText),
    list: copyListOf(sellGroups?.list ?? [], appraisalSellListText),
    refine: copyListOf(sellGroups?.refine ?? [], appraisalMultibuyText),
    multibuy: copyListOf(multibuyItems, appraisalMultibuyText),
  };

  async function handleCopy(list: CopyList) {
    const { count, text } = copyLists[list];
    if (text === '') return;
    setCopied(null);
    try {
      await writeToClipboard(text);
      setCopied({ list, count });
    } catch {
      // Nothing was copied, so no confirmation either.
    }
  }

  /*
   * The percent field is a string while it is being typed. Committing on every
   * keystroke would fight the typist: clearing the box to retype "90" sends an
   * empty string, and a field that snaps back to 100 the moment you delete a
   * digit cannot be edited at all. So the box holds whatever is typed, and the
   * setting is only written when what is typed is a number in range.
   */
  const [percentText, setPercentText] = useState(String(pricePercent));
  const [lastPercent, setLastPercent] = useState(pricePercent);
  if (pricePercent !== lastPercent) {
    // Adjusted during render rather than in an effect — the same idiom
    // `Market.tsx` uses to reset its order book when the selection changes,
    // and for the same reason: an effect would paint the stale value first.
    // A value the pilot is mid-way through typing does not land here, because
    // that path only writes `pricePercent` once what is typed has parsed.
    setLastPercent(pricePercent);
    if (Number(percentText) !== pricePercent) setPercentText(String(pricePercent));
  }

  function handlePercentChange(next: string) {
    setPercentText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && isValidPricePercent(parsed)) onPricePercentChange(parsed);
  }

  const columns: DataTableColumn<OwnedRow>[] = [
    {
      id: 'quantity',
      header: owned ? t('market.appraisal.columnNeed') : t('market.appraisal.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      // A count, not ISK — an ISK formatter would run `clampIskZero` over it.
      render: (row) =>
        row.need !== undefined ? (
          <span>
            {formatVolume(row.need)}
            <span className="block text-[0.625rem] text-text-dim">
              {t('market.appraisal.ownedBeneath', { qty: formatVolume(row.owned ?? 0) })}
            </span>
          </span>
        ) : (
          formatVolume(row.quantity)
        ),
      sortValue: (row) => row.need ?? row.quantity,
    },
    {
      id: 'item',
      header: t('market.appraisal.columnItem'),
      primary: true,
      // A priced line is nearly always followed by "…and what is the book
      // actually like?", so the name is the way through to the Browser. The
      // link drops `section`, which is exactly what `Market.tsx` reads as an
      // incoming item link and answers by switching tabs; the paste itself
      // survives the trip because `useAppraisal` lives at route level.
      render: (row) => <MarketItemLink typeId={row.typeId}>{row.name}</MarketItemLink>,
      sortValue: (row) => row.name,
    },
  ];

  const rows = useMemo(() => result?.appraisal.rows ?? [], [result]);
  // Fully covered lines sink to the bottom (stable otherwise) and render dim.
  const tableRows: OwnedRow[] = useMemo(() => {
    if (!owned) return rows;
    const withOwned: OwnedRow[] = subtractOwned(rows, owned);
    return [
      ...withOwned.filter((r) => (r.need ?? 0) > 0),
      ...withOwned.filter((r) => r.need === 0),
    ];
  }, [rows, owned]);
  const csvColumns = useMemo(() => appraisalCsvColumns(t), [t]);
  const tableExport = useTableExport({ surface: 'market-appraisal', rows, columns: csvColumns });
  const totals = result?.appraisal.totals;
  const unmatched = result?.unmatched ?? [];
  const implantBonusPct = result?.implantBonusPct ?? 0;
  const refinesOreOrIce = result?.refinesOreOrIce ?? false;
  const accountingLevel = result?.accountingLevel ?? null;
  const brokerRelationsLevel = result?.brokerRelationsLevel ?? null;
  // Null while skills are loading, or with no active Character — falls back
  // to the result panel's own loading/empty states rather than ever showing
  // a base-rate (untrained) figure.
  const net = useMemo(() => {
    if (result === null || accountingLevel === null || brokerRelationsLevel === null) return null;
    return appraisalNet(result.appraisal.items, {
      accountingLevel,
      brokerRelationsLevel,
      standing,
    });
  }, [result, accountingLevel, brokerRelationsLevel, standing]);
  // Undefined per row when the type has no reprocessing data at all — the
  // column only earns its place on screen when at least one row has
  // something to show, which is also exactly when there is nothing to show
  // with no active Character (`appraisalData.ts` never sets `refine` then).
  const hasRefine = rows.some((row) => row.refineTotal !== undefined);
  // Undefined per row when nothing the active Character holds LP with sells
  // this item — same "only earns its place once something has it" rule as
  // the refine column, and also why this never shows with no active
  // Character (`appraisalData.ts` never sets `lpOption` then).
  const hasLpOption = rows.some((row) => row.lpCorpName !== undefined);

  // The optional columns' catalog, keyed by `AppraisalColumnId` so the
  // `ColumnPickerMenu` below and the push loop past it share one definition.
  // Refine and LP store still only ever enter `availableColumns` when the
  // data backing them exists — a picker toggle for a column with nothing to
  // show would just be a lie.
  const optionalColumnsById: Record<AppraisalColumnId, DataTableColumn<OwnedRow>> = {
    buyEach: {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.buyEach),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    sellEach: {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.sellEach),
      sortValue: (row) => row.sellEach ?? undefined,
    },
    buyTotal: {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        comparisonCell(
          totalCell(row.buyTotal),
          row.refineTotal !== undefined && !refineBeatsSellAsIs(row)
        ),
      sortValue: (row) => row.buyTotal ?? undefined,
    },
    sellTotal: {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => totalCell(row.sellTotal),
      sortValue: (row) => row.sellTotal ?? undefined,
    },
    refineTotal: {
      id: 'refineTotal',
      header: t('market.appraisal.columnRefineTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        row.refineTotal === undefined
          ? '—'
          : comparisonCell(
              totalCell(row.refineTotal),
              refineBeatsSellAsIs(row),
              row.refinePricedAll === false && (
                <HintText
                  content={t('market.appraisal.refinePartialHint')}
                  className="ml-0.5 text-warning"
                >
                  *
                </HintText>
              ),
              // Left of the number, so the right-aligned digits stay in line down the column.
              leftoverTipsRefine(row) && (
                <HintText
                  content={t('market.appraisal.refineLeftoverHint', {
                    count: row.refineUnitsLeftOver,
                    isk: formatIskAuto((row.refineUnitsLeftOver ?? 0) * (row.buyEach ?? 0)),
                    buyTotal: formatIskAuto(row.buyTotal ?? 0),
                  })}
                  className="mr-1 text-warning"
                >
                  !
                </HintText>
              )
            ),
      sortValue: (row) => row.refineTotal ?? undefined,
    },
    lpTotal: {
      id: 'lpTotal',
      header: t('market.appraisal.columnLpTotal'),
      align: 'right',
      // Kept to the width of an ISK figure plus one icon — never the full
      // "X ISK + Y LP (Corp)" sentence, which would blow out the column at
      // phone width. That sentence still exists, as the icon's tooltip and
      // accessible name (`LpStoreLink`'s `label`).
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        if (row.lpCorpName === undefined || row.lpCorporationId === undefined) return '—';
        const label = t('market.appraisal.lpTotalCell', {
          isk: formatIskAuto(row.lpIskCost ?? 0),
          lp: formatVolume(row.lpCost ?? 0),
          corp: row.lpCorpName,
        });
        return comparisonCell(
          <span className="inline-flex items-center gap-1">
            {totalCell(row.lpIskCost ?? null)}
            <LpStoreLink corporationId={row.lpCorporationId} label={label} />
          </span>,
          lpBeatsMarket(row),
          row.lpAffordable === false && (
            <HintText
              content={t('market.appraisal.lpUnaffordableHint', { corp: row.lpCorpName })}
              className="ml-0.5 text-warning"
            >
              *
            </HintText>
          )
        );
      },
      sortValue: (row) => row.lpIskCost ?? undefined,
    },
    volume: appraisalVolumeColumn(t),
  };
  const availableColumns = APPRAISAL_COLUMN_IDS.filter(
    (id) => (id !== 'refineTotal' || hasRefine) && (id !== 'lpTotal' || hasLpOption)
  );
  for (const id of availableColumns) {
    if (visibleColumns.includes(id)) columns.push(optionalColumnsById[id]);
  }

  // The same menu the tree, the Quickbar and the Variations table carry — an
  // appraised row is an item like any other, and every action on it applies.
  // The Item Detail modal (Market's `ItemActionsProvider`) and `CompareDrawer`
  // sit outside Market's section guards, so Show Info and Add to Compare work
  // from this tab without a second copy of either.
  function rowContextMenu(row: OwnedRow, tr: ReactElement) {
    return (
      <ItemContextMenu typeId={row.typeId} itemName={row.name}>
        {tr}
      </ItemContextMenu>
    );
  }

  const pasteFolded = !isDesktop && rows.length > 0 && !editingList;
  // About the pasted list, so it shows folded or open.
  const unmatchedNote = unmatched.length > 0 && (
    <div className="rounded-xs border border-line bg-panel-2 px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
        <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
        {t('market.appraisal.unmatched', { count: unmatched.length })}
      </p>
      <ul className="pt-1">
        {unmatched.map((entry) => (
          <li key={entry.name} className="font-mono text-[0.6875rem] text-text-dim">
            {t('market.appraisal.unmatchedLine', {
              lines: entry.lines.join(', '),
              name: entry.name,
            })}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[18rem_minmax(0,1fr)]">
      {pasteFolded ? (
        <div className="flex flex-col gap-2 rounded-xs border border-line bg-panel/85">
          <button
            type="button"
            aria-expanded={false}
            onClick={() => {
              focusListOnOpen.current = true;
              setEditingList(true);
            }}
            className={`flex min-h-11 w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs ${rowInteractiveClassName} ${focusRingInsetClassName}`}
          >
            <Caret expanded={false} />
            <span className="font-medium">
              {t('market.appraisal.pasteFolded', { count: countPasteLines(text) })}
            </span>
            <span className="text-text-dim">
              {t('market.appraisal.pasteFoldedMeta', { hub: hubName, percent: pricePercent })}
            </span>
          </button>
          {unmatchedNote && <div className="px-3 pb-3">{unmatchedNote}</div>}
        </div>
      ) : (
        <Panel
          title={t('market.appraisal.pasteTitle')}
          actions={
            recent.length > 0 ? (
              <Select
                value=""
                onValueChange={(value) => {
                  if (value === CLEAR_RECENT) void setRecent([]);
                  else
                    appraiseFromForm(() =>
                      controller.appraiseText(recent[Number(value)]?.text ?? '')
                    );
                }}
              >
                <SelectTrigger
                  size="sm"
                  id="market-appraisal-recent"
                  aria-label={t('market.appraisal.recentPlaceholder')}
                  className="w-32 max-w-full min-w-0"
                >
                  <SelectValue placeholder={t('market.appraisal.recentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {recent.map((entry, index) => {
                    const { names, more } = recentLabel(entry.text);
                    return (
                      <SelectItem key={entry.text} value={String(index)}>
                        {t(
                          more > 0
                            ? 'market.appraisal.recentLabelMore'
                            : 'market.appraisal.recentLabel',
                          {
                            names: names.join(', '),
                            count: more,
                            age: formatAge(openedAt - entry.savedAt, t),
                          }
                        )}
                      </SelectItem>
                    );
                  })}
                  <SelectSeparator />
                  <SelectItem value={CLEAR_RECENT} className="text-text-dim">
                    {t('market.appraisal.clearRecent')}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : undefined
          }
          meta={
            controller.canAppraise ? (
              <StatChip
                label={t('market.appraisal.linesLabel')}
                // The box's own line count, which is deliberately not the
                // table's row count: repeated names merge into one priced row,
                // so "15 lines" and "14 items" can both be true. Split by the
                // parser's own rule rather than a second regex here, so the two
                // can never disagree about what a line is.
                value={formatVolume(countPasteLines(text))}
              />
            ) : undefined
          }
        >
          <div className="flex flex-col gap-2">
            <label className="block text-xs text-text-dim" htmlFor="market-appraisal-text">
              {t('market.appraisal.pasteLabel')}
            </label>
            <TextArea
              id="market-appraisal-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onSubmitChord={() => {
                if (controller.canAppraise && !loading) appraiseFromForm(controller.appraise);
              }}
              rows={pasteBoxRows(text)}
              spellCheck={false}
              placeholder={t('market.appraisal.pastePlaceholder')}
              mono
              className="text-[0.6875rem]"
            />

            <div className="flex items-center gap-2">
              <label
                className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
                htmlFor="market-appraisal-percent"
              >
                {t('market.appraisal.pricePercentLabel')}
              </label>
              <TextInput
                id="market-appraisal-percent"
                size="sm"
                type="number"
                inputMode="decimal"
                min={MIN_PRICE_PERCENT}
                max={MAX_PRICE_PERCENT}
                value={percentText}
                onChange={(event) => handlePercentChange(event.target.value)}
                className="field-no-spinner w-16 text-right"
              />
              <Select
                value={hub.id}
                onValueChange={(value) => onHubChange(value as TradeHub['id'])}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t('market.tradeHub')}
                  className="min-w-0 flex-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADE_HUBS.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.systemName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex min-h-9 items-center gap-2 text-xs">
                <Checkbox
                  checked={minusOwned}
                  disabled={lacksAssets || characterId === null}
                  onChange={(event) =>
                    void setOwnedPref({ ...ownedPref, enabled: event.target.checked })
                  }
                />
                {t('market.appraisal.minusOwned')}
              </label>
              {ownedPref.enabled && !lacksAssets && characterId !== null && (
                <Select
                  value={String(ownedStationId)}
                  onValueChange={(value) =>
                    void setOwnedPref({ ...ownedPref, stationId: Number(value) })
                  }
                >
                  <SelectTrigger size="sm" aria-label={t('market.appraisal.minusOwnedStation')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADE_HUBS.map((h) => (
                      <SelectItem key={h.id} value={String(h.stationId)}>
                        {h.systemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {lacksAssets && (
                <GrantNote
                  endpoints={ASSETS_ENDPOINTS}
                  title={t('market.appraisal.minusOwnedGrantTitle')}
                  hint={t('market.appraisal.minusOwnedGrantHint')}
                  actionLabel={t('market.appraisal.minusOwnedGrantAction')}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="md"
                variant="primary"
                className="max-sm:w-full"
                onClick={() => appraiseFromForm(controller.appraise)}
                disabled={!controller.canAppraise || loading}
              >
                {t('market.appraisal.appraise')}
              </Button>
              <Button size="md" onClick={controller.clear} disabled={text === ''}>
                {t('market.appraisal.clear')}
              </Button>
            </div>

            {unmatchedNote}
          </div>
        </Panel>
      )}

      <div className="flex flex-col gap-4">
        <Panel
          title={t('market.appraisal.resultTitle')}
          headingRef={resultHeadingRef}
          padded={result === null}
          meta={
            result !== null ? (
              <StatChip label={hubName} value={t('market.appraisal.atPercent', { pricePercent })} />
            ) : undefined
          }
          actions={
            result === null || failed || rows.length === 0 ? undefined : (
              <>
                <ColumnPickerMenu
                  available={availableColumns}
                  visible={visibleColumns}
                  columnsById={optionalColumnsById}
                  onToggle={toggleColumn}
                  buttonLabel={t('market.appraisal.columnsButton')}
                  menuTitle={t('market.appraisal.columnsMenuTitle')}
                  size="sm"
                />
                <IconButton
                  size="sm"
                  icon={share.status === 'copied' ? <Icon.Done /> : <Icon.Share />}
                  label={t('market.appraisal.share')}
                  tooltip={
                    shareItemCount > MAX_SNAPSHOT_ITEMS
                      ? t('market.appraisal.shareTooLarge')
                      : share.status === 'saving'
                        ? t('market.appraisal.shareSaving')
                        : share.status === 'failed'
                          ? t('market.appraisal.shareFailed')
                          : share.status === 'copied'
                            ? t('market.appraisal.shareCopied')
                            : undefined
                  }
                  disabled={
                    characterId === null ||
                    !isSyncConfigured() ||
                    rows.length === 0 ||
                    shareItemCount > MAX_SNAPSHOT_ITEMS ||
                    share.status === 'saving'
                  }
                  onClick={() => void handleShare()}
                />
                {copied !== null && (
                  <span role="status" className="text-[0.6875rem] text-text-dim">
                    {t('market.appraisal.copied', {
                      list: t(`market.appraisal.copyList.${copied.list}`),
                      count: copied.count,
                    })}
                  </span>
                )}
                <TableActionsMenu
                  name={t('market.appraisal.resultTitle')}
                  tableExport={tableExport}
                >
                  {COPY_LISTS.map((list) => (
                    <MenuItem
                      key={list}
                      disabled={copyLists[list].count === 0}
                      onSelect={() => void handleCopy(list)}
                    >
                      {t(`market.appraisal.copyList.${list}`)}
                      {copyLists[list].count > 0 && (
                        <span className="ml-auto pl-3 text-text-dim">{copyLists[list].count}</span>
                      )}
                    </MenuItem>
                  ))}
                </TableActionsMenu>
              </>
            )
          }
        >
          {loading && result === null ? (
            <div className="flex justify-center py-8">
              <Spinner label={t('common.loading')} />
            </div>
          ) : failed ? (
            <EmptyState
              title={t('market.loadFailedTitle')}
              hint={t('market.loadFailedHint')}
              className="py-8"
            />
          ) : result === null || totals === undefined ? (
            <EmptyState
              title={t('market.appraisal.emptyTitle')}
              hint={t('market.appraisal.emptyHint')}
              className="py-8"
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('market.appraisal.noMatchesTitle')}
              hint={t('market.appraisal.noMatchesHint')}
              className="py-8"
            />
          ) : (
            <>
              {share.status === 'manual' && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                  <label
                    htmlFor="market-appraisal-share-url"
                    className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
                  >
                    {t('market.appraisal.shareReady')}
                  </label>
                  <TextInput
                    id="market-appraisal-share-url"
                    size="sm"
                    readOnly
                    value={share.url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 font-mono"
                  />
                  <Button size="sm" onClick={() => void handleCopyShareUrl(share.url)}>
                    {t('market.appraisal.shareCopy')}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                {minusOwned && (
                  <span className="w-full text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('market.appraisal.minusOwnedChip', { station: ownedStation.systemName })}
                  </span>
                )}
                <AppraisalHeaderStats
                  totals={totals}
                  net={net}
                  itemCount={rows.length}
                  showRefine={hasRefine}
                  showCheapest={hasLpOption}
                  implantBonusPct={implantBonusPct}
                />
                {loading && <Spinner label={t('common.loading')} size="sm" />}
              </div>

              {cargo !== null && <AppraisalHoldBar totals={totals} cargo={cargo} />}

              {net && pricePercent !== 100 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                  {t('market.appraisal.netAlwaysAt100Note')}
                </p>
              )}

              {net && (
                <AssumesBaseStandingsNote
                  className="border-b border-line px-3"
                  hint={t('market.appraisal.assumesBaseStandingsHint')}
                />
              )}

              {hasRefine && refinesOreOrIce && (
                <div className="border-b border-line px-3 empty:hidden">
                  <ImplantsAssumedNote hint={t('market.appraisal.refineAssumesNoImplantsHint')} />
                </div>
              )}

              {totals.unpricedRows > 0 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-warning">
                  {t('market.appraisal.unpriced', { count: totals.unpricedRows })}
                </p>
              )}
              {totals.refineUnpricedRows > 0 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-warning">
                  {t('market.appraisal.refineUnpriced', { count: totals.refineUnpricedRows })}
                </p>
              )}
              {totals.cheapestBuyViaLp > 0 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                  {t('market.appraisal.cheapestBuyViaLp', { count: totals.cheapestBuyViaLp })}
                </p>
              )}

              {/* A card a little narrower than the table's own minimum scrolls here instead of pushing past its column (#2949). */}
              <div className="min-w-0 overflow-x-auto">
                <DataTable
                  {...tableExport.tableProps}
                  columns={columns}
                  rows={tableRows}
                  rowKey={(row) => row.typeId}
                  label={t('market.appraisal.resultTitle')}
                  className="pb-1"
                  rowContextMenu={rowContextMenu}
                  rowMoreActions
                  // Five or six short figures a card: one per line runs a priced
                  // row to six, and hiding a column buys the same height at the
                  // cost of a figure.
                  stackColumns={2}
                  mobileSort
                />
              </div>
            </>
          )}
        </Panel>

        {compare !== null && (
          // Deliberately not a panel: the hub cards are panel surfaces
          // themselves, so framing them put a box around five boxes. The fold
          // survives as a bare caret-plus-heading row on the page ground — the
          // leading caret stays its own `IconButton` rather than swallowing the
          // heading, so the toggle's accessible name is not an `aria-label`
          // overriding visible text (WCAG 2.5.3).
          <section aria-labelledby="market-appraisal-compare-hubs">
            <div className="flex min-h-9 items-center gap-1">
              <IconButton
                size="sm"
                icon={<Caret expanded={compareExpanded} />}
                label={
                  compareExpanded
                    ? t('market.appraisal.compareHubsHide')
                    : t('market.appraisal.compareHubsShow')
                }
                aria-expanded={compareExpanded}
                onClick={() => setCompareExpanded((open) => !open)}
              />
              <h2
                id="market-appraisal-compare-hubs"
                className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
              >
                {t('market.appraisal.compareHubsTitle')}
              </h2>
            </div>
            {compareExpanded && <HubCompareCards rows={compare} />}
          </section>
        )}
      </div>
    </div>
  );
}
