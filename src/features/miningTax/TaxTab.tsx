import { NO_NAMES } from '@/lib/emptyCollections';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { TaxDialogsHost } from '@/features/miningTax/TaxDialogsHost';
import { isSelectableRow, useTaxColumns } from '@/features/miningTax/useTaxColumns';
import { useTaxDialogs, useTaxDialogSelector } from '@/features/miningTax/useTaxDialogs';
import { typeLabels } from './typeLabels';
import { UnpricedOreDetail } from './UnpricedOreDetail';
import { hasReachableUnpricedHub } from './unpricedHubs';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { guarded } from '@/app/routeChunks';
import { useTranslation } from 'react-i18next';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { useSurveyPayeeId } from './surveyPayeePref';
import { useSearchParams } from 'react-router-dom';
import {
  findRowForPaymentRef,
  PAYMENT_REF_PARAM,
  parsePaymentRefParam,
} from '@/features/miningTax/paymentDeepLink';
import {
  Button,
  DataAgeBadge,
  DataTable,
  DataTableSortPicker,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  HeaderMoreMenu,
  IconButton,
  NeedsConnection,
  PageHeader,
  Panel,
  Spinner,
  Toast,
  TabPanel,
  CachedNotice,
} from '@/components/ui';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { PageSettingsModal } from '@/features/settings/PageSettingsModal';
import { MiningTaxSettingsForm } from '@/features/settings/MiningTaxSettingsForm';
import { useTableExport } from '@/components/ui/useTableExport';
import { beginGrant } from '@/app/grantAction';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { toggleFilterMember } from '@/lib/multiSelectFilter';
import { useRememberedUrlParams, useUrlSort } from '@/lib/useUrlState';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { type UrlParamCodec } from '@/lib/urlState';
import type { TradeHub } from '@/market/hubs';
import type { PayeeRecord } from '@/db';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import {
  loadMoonMiningTaxSnapshot,
  type MoonMiningTaxRow,
  type TrackedCharacter,
} from '@/features/miningTax/snapshot';
import { allMembers, type DisplayRow, type GroupMember } from '@/features/miningTax/groupRows';
import { resolveRowNames, systemLabel } from '@/features/miningTax/names';
import {
  loadDatedUnitPricesByHub,
  pricesAtHubOnDate,
  sellFallbackAtHubOnDate,
  sourcesAtHubOnDate,
  type DatedUnitPrices,
} from '@/features/miningTax/pricing';
import { loadOreFormNames, readCompressedOre, useRefreshOnOreFormChange } from './oreForm';
import { assignmentsMovedWithPayee } from '@/features/miningTax/ledgerActions';
import { tagAsIgnored, tagAsMoonOre } from '@/features/miningTax/typeOverrides';
import { TypeOverridesDialog } from '@/features/miningTax/TypeOverridesDialog';
import { computePayeeBalances, summarizeUnassigned } from '@/features/miningTax/balances';
import {
  combineEligibility,
  dismissableRows,
  settleUpMembers,
} from '@/features/miningTax/selection';
import { SelectionToolbar } from '@/features/miningTax/SelectionToolbar';
import { useLinkSuggestions, useMadePayments } from '@/features/miningTax/useMadePayments';
import { useContinuations } from '@/features/miningTax/useContinuations';
import { dateLabel, dateRangeOf, taxOwedOf } from '@/features/miningTax/taxRowFormat';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import { defaultPayer } from '@/features/miningTax/settlePayer';
import type { PayeeOwed } from '@/features/miningTax/PayeeManagerDialog';
import { findPricingGaps, type PricingGap } from '@/features/miningTax/pricingGaps';
import { taxCsvColumns } from '@/features/miningTax/taxCsv';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { AttentionStrip, type AttentionItem } from '@/features/miningTax/AttentionStrip';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
import { ContinueSessionCard } from '@/features/miningTax/ContinueSessionCard';
import { splitLedger } from '@/features/miningTax/ledgerSections';
import { systemsByPayee } from '@/features/miningTax/suggestPayee';
import { claimCorpTaxBookPayment } from '@/features/miningTax/corpBook/corpBookStore';
import { CorpBookSyncNote } from '@/features/miningTax/corpBook/CorpBookSyncNote';
import { PendingGroupingNotice } from '@/features/miningTax/corpBook/PendingGroupingNotice';
import {
  useCorpStateHint,
  useCorpStateLabel,
} from '@/features/miningTax/corpBook/useCorpStateText';
import {
  buildDisplayRows,
  corporationOfPayee,
  isBookRow,
  isCorpPayeeId,
} from '@/features/miningTax/corpBook/corpRows';
import { useCorpBookView } from '@/features/miningTax/corpBook/useCorpBookView';
import { useBookSystems } from '@/features/miningTax/corpBook/useBookSystems';

const PayeeManagerDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/PayeeManagerDialog')).then((m) => ({
    default: m.PayeeManagerDialog,
  }))
);

interface Snapshot {
  entries: MoonMiningTaxRow[];
  characters: TrackedCharacter[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  unclassified: { characterId: number; characterName: string; typeIds: number[] }[];
  reauthCharacters: TrackedCharacter[];
  fetchedAt: Date | null;
  fromCache: boolean;
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
  /** Per-hub, per-date buy prices — the day the ore was mined, not "now" (issue #523 follow-up). Resolved per Payee/date by `pricesFor`. */
  datedPrices: DatedUnitPrices;
  /** Per hub, the ore types that hub quoted no buy price for on any date they appeared — their price entry is 0, which is not the same claim as "worthless". */
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
  /** Union of `unpricedByHub` — whether the banner has anything at all to say. */
  unpricedTypeIds: Set<number>;
}

const NO_HUBS: ReadonlySet<TradeHub['id']> = new Set();
const NO_SECURITY: ReadonlyMap<number, number> = new Map();
const NO_PAYEES_BY_CHARACTER: ReadonlyMap<number, PayeeRecord[]> = new Map();

const EMPTY_DATED_PRICES: DatedUnitPrices = {
  byHubAndDate: new Map(),
  unpricedByHub: new Map(),
  sellFallbackByHubAndDate: new Map(),
  unpriced: new Set(),
};

async function loadSnapshot(_characterId: number, signal: RouteSnapshotSignal): Promise<Snapshot> {
  const result = await loadMoonMiningTaxSnapshot();
  if (signal.cancelled) {
    return {
      ...result,
      entries: result.rows,
      systemNames: new Map(),
      systemSecurity: new Map(),
      typeNames: new Map(),
      datedPrices: EMPTY_DATED_PRICES,
      unpricedByHub: new Map(),
      unpricedTypeIds: new Set(),
    };
  }
  const unclassifiedTypeIds = result.unclassified.flatMap((u) => u.typeIds);
  // Every hub any Payee bills at, so a dialog can re-price live as the pilot
  // changes which Payee an entry is assigned to. One fetch per *distinct*
  // hub — an all-Jita ledger, the common case, still makes exactly one.
  const payeeHubIds = [...result.payeesByCharacter.values()].flatMap((payees) =>
    payees.map((payee) => payee.hubId)
  );
  const dates = [...new Set(result.rows.map((row) => row.entry.date))];
  const compressed = await readCompressedOre();
  const [
    { systemNames, systemSecurity, typeNames: rowTypeNames },
    datedPrices,
    unclassifiedTypeNames,
  ] = await Promise.all([
    resolveRowNames(result.rows, compressed),
    loadDatedUnitPricesByHub(
      result.rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId)),
      payeeHubIds,
      dates,
      compressed
    ),
    loadOreFormNames(unclassifiedTypeIds, compressed),
  ]);
  const typeNames = new Map([...rowTypeNames, ...unclassifiedTypeNames]);
  return {
    ...result,
    entries: result.rows,
    systemNames,
    systemSecurity,
    typeNames,
    datedPrices,
    unpricedByHub: datedPrices.unpricedByHub,
    unpricedTypeIds: datedPrices.unpriced,
  };
}

/** `payeeFilter` as a URL query param: a comma-separated set of Payee ids, absent means "all". */
function payeeFilterParam(): UrlParamCodec<ReadonlySet<string> | 'all'> {
  return {
    parse: (raw) => (raw === null || raw === '' ? 'all' : new Set(raw.split(','))),
    serialize: (value) => (value === 'all' ? null : [...value].sort().join(',')),
  };
}

// Keys scoped `tax.*`: Mining's other tab (`OverviewTab`) has its own
// `character`/sort params on the same route, and `usePageTab` carries the
// query string across a tab switch — unscoped keys would leak Tax's filter
// and sort into Overview and back.
const TAX_URL_PARAMS = {
  'tax.character': characterFilterParam('all'),
  'tax.payee': payeeFilterParam(),
};

const TAX_DEFAULT_SORT = { columnId: 'date', direction: 'desc' as const };

/**
 * Moon Mining ledger (issue #523): one continuously-filterable list, all
 * tracked characters by default. The Tax tab of the Mining page (issue #671)
 * — the route shell (`src/routes/MoonMiningTax.tsx`) gates on the active
 * Character before mounting this, so a hydrated store and a non-null
 * `activeCharacterId` are already guaranteed here.
 */
interface TaxTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
  /** The id base the tab bar was built with, so the body is its tab panel. */
  tabsId: string;
}

export function TaxTab({ tabBar, tabsId }: TaxTabProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const isPhone = useIsPhone();
  const selectionToolbarRef = useRef<HTMLDivElement>(null);
  // The Ore column only where the table has room for it beside a full Payee
  // name: the Payee is what a row is read by, the ore is one click away in
  // the entry itself (and at 1024px it pushed Status off-screen, #2147).
  const showOreColumn = useMediaQuery('(min-width: 87.5rem)');
  // Est. value is out between the phone card and `lg`: there the other
  // columns' fixed widths would leave the Payee column no room at all. The
  // card still shows it, and so does every wider screen (and the export).
  const showValueColumn = useMediaQuery('(min-width: 64rem)') || isPhone;
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadSnapshot,
    undefined,
    { cacheKey: 'moonMiningTax' }
  );
  useRefreshOnOreFormChange(refresh);

  // Remembered per device once changed; a first visit stays on All characters.
  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof TAX_URL_PARAMS>(
    'miningTax',
    'tax.character',
    'all'
  );
  const [{ 'tax.character': characterFilter, 'tax.payee': payeeFilter }, setTaxUrlParams] =
    useRememberedUrlParams(TAX_URL_PARAMS, rememberedCharacterFilter);
  const setCharacterFilter = useCallback(
    (next: CharacterFilterValue) => setTaxUrlParams({ 'tax.character': next }),
    [setTaxUrlParams]
  );
  const setPayeeFilter = useCallback(
    (next: ReadonlySet<string> | 'all') => setTaxUrlParams({ 'tax.payee': next }),
    [setTaxUrlParams]
  );
  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);
  // Unconditional, deliberately. Hiding this behind "the pilot has at least
  // one tag" reads tidier and reintroduces the shape of the bug it exists to
  // fix: the check can only re-run when `data`'s identity changes, and a
  // reload that *fails* after a successful tag leaves `data` on the retained
  // snapshot — so the action would stay hidden while the error branch has
  // already taken the banner away, stranding the pilot exactly as before. The
  // dialog says so itself when there is nothing to show.
  const [oreTagsOpen, setOreTagsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Row keys checked in the Open table's select column. Feeds all three bulk
  // actions (settle up / combine / dismiss), never just bulk-pay.
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  // The dialogs' targets live in a store the dialogs host subscribes to, so
  // opening or closing one re-renders the host and not the tables (`useTaxDialogs`).
  const { store, actions } = useTaxDialogs();
  const acting = useTaxDialogSelector(store, (state) => state.acting);
  // The claim of an Unmatched donation.
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  // Combined rows the pilot has expanded in place (desktop), to show each day.
  const [expandedCombined, setExpandedCombined] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

  // Every tracked character, not just those with a Mining Ledger Entry this
  // refresh (GLOSSARY.md: the point of the feature is not missing an alt's
  // obligation) — a character with nothing mined yet still needs to appear
  // in the Characters filter and in Manage Payees.
  const characters = useMemo(() => data?.characters ?? [], [data]);

  const { madePayments, paymentSources } = useMadePayments(
    characters.map((c) => c.characterId).join(',')
  );

  // The member's Corp Tax Books (D24: only when their corp has an active one; otherwise null and
  // the tab is exactly what it was).
  const { view: corpView, reload: reloadCorpBooks } = useCorpBookView({
    rows: data?.entries,
    characters,
    activeCharacterId,
    madePayments,
    reloadKey: data?.fetchedAt?.getTime(),
  });
  // Book rows carry a raw solar system id; resolve it like a personal row's.
  const bookSystems = useBookSystems(corpView, {
    names: data?.systemNames ?? NO_NAMES,
    security: data?.systemSecurity ?? NO_SECURITY,
  });
  const corpStateLabel = useCorpStateLabel();
  const corpStateHint = useCorpStateHint();
  const allDisplayRows = useMemo(
    () =>
      buildDisplayRows(
        data?.entries ?? [],
        corpView?.overlay ?? null,
        (id) => characters.find((c) => c.characterId === id)?.characterName ?? `#${id}`
      ),
    [data, corpView, characters]
  );
  // What the personal ledger writes to: the rows the book decided are display-only.
  const personalRows = useMemo(
    () => allDisplayRows.filter((dr) => !isBookRow(dr)),
    [allDisplayRows]
  );

  // The wallet journal's "Mining tax" link (`paymentDeepLink.ts`): opens the
  // detail of the row that transaction paid. Latched on mount and spent at
  // once, like `useHighlightParam`, so a reload or a later refresh can't
  // reopen the modal after the pilot closed it. Searches every row, not the
  // filtered ones: a Character or Payee filter must not hide the target.
  const [searchParams, setSearchParams] = useSearchParams();
  // Read by the Assign dialog when it opens, long after this has hydrated.
  useHydratedStore(useSurveyPayeeId);
  const [initialPaymentRef] = useState(() =>
    parsePaymentRefParam(searchParams.get(PAYMENT_REF_PARAM))
  );
  const pendingPaymentRef = useRef(initialPaymentRef);
  useEffect(() => {
    if (initialPaymentRef === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(PAYMENT_REF_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [initialPaymentRef, setSearchParams]);
  // An effect rather than a render-phase write: the target now lives in the
  // dialogs store, which a render must not notify.
  useEffect(() => {
    if (pendingPaymentRef.current === null || !data) return;
    const target = findRowForPaymentRef(allDisplayRows, pendingPaymentRef.current);
    if (target) actions.openDetail(target);
    // A miss on cached data may be a snapshot older than the link; wait for the fresh read.
    if (target || !loading) pendingPaymentRef.current = null;
  }, [data, allDisplayRows, loading, actions]);

  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);

  const characterFiltered = useMemo(
    () =>
      allDisplayRows.filter(
        (dr) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(dr.row.characterId)
      ),
    [allDisplayRows, resolvedCharacterFilter]
  );

  // Every Payee across every tracked character, so the filter dropdown lists
  // them all regardless of the Character filter above — "who do I owe" is a
  // question about Payees, not about which alt mined it.
  const allPayees = useMemo(() => {
    const seen = new Map<string, PayeeRecord>();
    for (const payees of data?.payeesByCharacter.values() ?? []) {
      for (const payee of payees) seen.set(payee.id, payee);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const payeeById = useMemo(() => new Map(allPayees.map((p) => [p.id, p])), [allPayees]);

  // The Payees balances and the Payee filter know: the member's own, plus each Corp Tax Book's
  // virtual "<Corp> (Corp Tax Book)" Payee. Never offered to an Assign dialog.
  const ledgerPayees = useMemo(
    () => [...allPayees, ...(corpView?.payees ?? [])],
    [allPayees, corpView]
  );

  const datedPrices = data?.datedPrices ?? EMPTY_DATED_PRICES;
  const systemNames = bookSystems.names;
  const systemSecurity = bookSystems.security;

  /**
   * The seam every value-computing dialog reads: prices at whichever hub a
   * Payee bills at, on the date the ore was actually mined (issue #523
   * follow-up decision doc) — not "now". A lookup rather than one map,
   * because the dialogs are where the Payee (and so the hub) is chosen —
   * assigning to a different Payee, or splitting ore over to a second one,
   * re-values the same ore against a different order book, and this is what
   * lets that happen without another fetch.
   */
  const pricesFor = useCallback(
    (hubId: string | undefined, date: string): ReadonlyMap<number, number> =>
      pricesAtHubOnDate(datedPrices, hubId, date),
    [datedPrices]
  );

  /** Which price tier produced each of `pricesFor`'s numbers — the row detail's breakdown. */
  const priceSourcesFor = useCallback(
    (hubId: string | undefined, date: string) => sourcesAtHubOnDate(datedPrices, hubId, date),
    [datedPrices]
  );

  /** Both the table's Value column and the sole Assignment-less rows: an unassigned entry has no `estimatedValue` of its own, so it's priced live from its still-unclaimed ore lines instead. A combined row sums every member's own value — never a blended re-price across dates. */
  const estimatedValueOf = useCallback(
    (dr: DisplayRow): number =>
      dr.assignment
        ? allMembers(dr).reduce((sum, m) => sum + m.assignment.estimatedValue, 0)
        : computeAssignmentValue(
            dr.row.unassignedOreLines,
            pricesAtHubOnDate(datedPrices, undefined, dr.row.entry.date),
            0
          ).estimatedValue,
    [datedPrices]
  );

  const systemName = useCallback(
    (dr: DisplayRow): string =>
      dr.row.entry.solarSystemId === 0 ? '—' : systemLabel(systemNames, dr.row.entry.solarSystemId),
    [systemNames]
  );

  const payeeName = useCallback(
    (payeeId: string | undefined): string =>
      ledgerPayees.find((p) => p.id === payeeId)?.name ?? t('miningTax.unknownPayee'),
    [ledgerPayees, t]
  );

  /** The detail modal's Payee display: a resolved name, "No tax owed" for a dismissal, or a dash when unassigned. */
  const payeeDisplayName = useCallback(
    (dr: DisplayRow): string => {
      // Before the corp's record is final, its name is the hint of whose it will be (D12).
      if (dr.corp?.kind === 'label' && dr.corp.state === 'pending') {
        return t('miningTax.corpBook.payeeName', { corp: dr.corp.corpName });
      }
      if (dr.corp?.kind === 'row') return payeeName(dr.assignment?.payeeId);
      if (!dr.assignment) return '—';
      if (dr.assignment.status === 'dismissed') return t('miningTax.dismissedLabel');
      return payeeName(dr.assignment.payeeId);
    },
    [payeeName, t]
  );

  const settleUpRowsFor = useCallback(
    (members: readonly GroupMember[]): SettleUpRow[] =>
      members.map((m) => {
        const payeeId = m.assignment.payeeId;
        const entityId = payeeById.get(payeeId ?? '')?.entityId;
        return {
          assignment: m.assignment,
          characterName: m.row.characterName,
          payeeName: payeeName(payeeId),
          ...(payeeId === undefined ? {} : { payeeId }),
          ...(entityId === undefined ? {} : { payeeEntityId: entityId }),
        };
      }),
    [payeeById, payeeName]
  );

  // Which entries the pricing banner is about, so it can link to them — the
  // table only shows an entry's total, never per-ore prices.
  const pricingGaps = useMemo(() => {
    if (!data) return [];
    return findPricingGaps(personalRows, {
      hubIdOf: (assignment) => payeeById.get(assignment?.payeeId ?? '')?.hubId,
      pricesAt: (hubId, date) => pricesAtHubOnDate(data.datedPrices, hubId, date),
      sellFallbackAt: (hubId, date) => sellFallbackAtHubOnDate(data.datedPrices, hubId, date),
    });
  }, [data, personalRows, payeeById]);

  // `payeeFilter` is URL-held, so a stale or hand-edited link can name Payee
  // ids nobody tracked has — the codec can't validate that itself (it has no
  // access to `allPayees`), so unknown ids are dropped here instead, the same
  // "unknown value falls back to the default" rule the codecs otherwise apply
  // themselves. Emptying out entirely (every id unknown) reads as no filter.
  const resolvedPayeeFilter = useMemo(() => {
    if (payeeFilter === 'all') return 'all' as const;
    const known = new Set(ledgerPayees.map((p) => p.id));
    const kept = new Set([...payeeFilter].filter((id) => known.has(id)));
    return kept.size === 0 ? ('all' as const) : kept;
  }, [payeeFilter, ledgerPayees]);

  // Filtering "by Payee" only makes sense for rows that already have one —
  // an unassigned or dismissed row has no Payee to match, so it drops out as
  // soon as a specific Payee is selected.
  const visibleRows = useMemo(
    () =>
      resolvedPayeeFilter === 'all'
        ? characterFiltered
        : characterFiltered.filter(
            (dr) =>
              dr.assignment?.payeeId !== undefined && resolvedPayeeFilter.has(dr.assignment.payeeId)
          ),
    [characterFiltered, resolvedPayeeFilter]
  );

  // The owed cards: per Payee, what is owed *now*. Follows the Character
  // filter (an alt's debts are still debts) but deliberately not the Payee
  // filter — narrowing the ledger to one Payee must not change a balance.
  const balances = useMemo(
    () => computePayeeBalances(characterFiltered, ledgerPayees),
    [characterFiltered, ledgerPayees]
  );
  // A row a Corp Tax Book has labelled (Pending corp record, Unattributed) is not waiting on the
  // member: it stays out of the "needs assigning" count.
  const unassigned = useMemo(
    () =>
      summarizeUnassigned(
        characterFiltered.filter((dr) => !dr.corp),
        estimatedValueOf
      ),
    [characterFiltered, estimatedValueOf]
  );

  const everyAssignment = useMemo(
    () => personalRows.flatMap((dr) => allMembers(dr).map((m) => m.assignment)),
    [personalRows]
  );

  const linkSuggestions = useLinkSuggestions({ madePayments, everyAssignment, balances });

  // Every Payee's systems and owed entries, for the Payee manager's rows.
  const payeeSystems = useMemo(
    () => systemsByPayee(everyAssignment, allPayees),
    [everyAssignment, allPayees]
  );
  const owedByPayee = useMemo(() => {
    const out = new Map<string, PayeeOwed>();
    for (const a of everyAssignment) {
      // Owed means Outstanding, as on the balance cards: a needs-review entry
      // was already paid (or dismissed) before it grew.
      if (!a.payeeId || a.status !== 'outstanding') continue;
      const entry = out.get(a.payeeId) ?? { amount: 0, count: 0, moving: 0 };
      entry.amount += a.taxOwed;
      entry.count += 1;
      out.set(a.payeeId, entry);
    }
    for (const [payeeId, entry] of out) {
      entry.moving = assignmentsMovedWithPayee(everyAssignment, payeeId).length;
    }
    return out;
  }, [everyAssignment]);

  /** A player claims their own Unmatched donation: audited and uid-authorised server side. */
  async function handleClaim(
    characterId: number,
    corporationId: number,
    paymentId: string,
    claimKey: string
  ) {
    setClaiming(claimKey);
    setClaimError(null);
    try {
      await claimCorpTaxBookPayment(characterId, corporationId, paymentId);
      reloadCorpBooks();
    } catch {
      setClaimError(claimKey);
    } finally {
      setClaiming(null);
    }
  }

  // A Corp Tax Book row is the corp's to continue, not the member's.
  const continuationRows = useMemo(
    () => characterFiltered.filter((dr) => !isBookRow(dr)),
    [characterFiltered]
  );
  const {
    continuations,
    continuing,
    autoContinue,
    autoSkip,
    handleContinue,
    keepSeparate,
    setAutoContinueFromCard,
  } = useContinuations({
    hasData: Boolean(data),
    rows: continuationRows,
    allDisplayRows,
    payeeById,
    pricesFor,
    refresh,
    setToast,
  });
  const busy = continuing || acting;

  function togglePayee(payeeId: string) {
    setPayeeFilter(
      toggleFilterMember(
        resolvedPayeeFilter,
        payeeId,
        ledgerPayees.map((p) => p.id)
      )
    );
  }

  const isSolePayeeFilter = (payeeId: string) =>
    resolvedPayeeFilter !== 'all' &&
    resolvedPayeeFilter.size === 1 &&
    resolvedPayeeFilter.has(payeeId);

  /** A balance's Payee name doubles as "show me just this Payee's entries" — the filter its own figure came from. */
  function filterToPayee(payeeId: string) {
    setPayeeFilter(isSolePayeeFilter(payeeId) ? 'all' : new Set([payeeId]));
  }

  /**
   * "Pay them in one lump sum": every Outstanding Assignment behind one
   * balance, straight into Settle up — paid by the active Character when it
   * owes some, so a balance spanning Characters isn't one blended figure.
   */
  function settleUpBalance(members: readonly GroupMember[]) {
    openSettleUpFor(settleUpRowsFor(members));
  }

  function openSettleUpFor(rows: SettleUpRow[]) {
    const payerId = defaultPayer(rows, activeCharacterId);
    actions.openSettleUp(rows, payerId === null ? {} : { payerId });
  }

  /** The "Assign next" shortcut: the newest still-unassigned entry, opened straight into its Assign form. */
  function assignNext() {
    const next = [...characterFiltered]
      .filter((dr) => dr.status === 'unassigned' && !dr.corp)
      .sort((a, b) => b.row.entry.date.localeCompare(a.row.entry.date))[0];
    if (next) actions.openDetail(next);
  }

  async function handleTagAsMoonOre(typeId: number) {
    await tagAsMoonOre(typeId);
    refresh();
  }

  async function handleTagAsIgnored(typeId: number) {
    await tagAsIgnored(typeId);
    refresh();
  }

  /** Buttons that open each affected entry, naming the ore at fault — the table itself never shows per-ore prices. */
  function renderGapLinks(gaps: readonly PricingGap[], pick: (gap: PricingGap) => number[]) {
    return (
      <div className="space-y-0.5">
        <p>{t('miningTax.pricingGapEntries')}</p>
        <ul className="space-y-0.5">
          {gaps.map((gap) => (
            <li key={gap.row.key}>
              <button
                type="button"
                className={`text-left ${inlineLinkClassName}`}
                onClick={() => actions.openDetail(gap.row)}
              >
                {t('miningTax.pricingGapEntry', {
                  date: gap.row.row.entry.date,
                  system: systemName(gap.row),
                  types: typeLabels(pick(gap), data?.typeNames ?? NO_NAMES),
                })}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const systemSecurityOf = useCallback(
    (dr: DisplayRow): number | undefined => systemSecurity?.get(dr.row.entry.solarSystemId),
    [systemSecurity]
  );

  const { open: openRows, history } = useMemo(
    () => splitLedger(visibleRows, (dr) => dateRangeOf(dr).at(-1) ?? dr.row.entry.date),
    [visibleRows]
  );
  const historyRows = useMemo(() => history.flatMap((month) => month.rows), [history]);

  // Every bulk action reads the selection narrowed to what is *on screen*:
  // selection state survives a filter change, so acting on the full set would
  // let Dismiss reach entries the pilot cannot see.
  const selectedRows = useMemo(
    () => openRows.filter((dr) => selection.has(dr.key)),
    [openRows, selection]
  );
  // The sticky toolbar covers the page bottom: reserve its height as scroll padding so a focused row clears it.
  useStickyClearance(selectionToolbarRef, 'selection-toolbar', {
    enabled: selectedRows.length > 0,
  });

  const selectedSettleUpRows: SettleUpRow[] = useMemo(
    () => settleUpRowsFor(settleUpMembers(selectedRows)),
    [selectedRows, settleUpRowsFor]
  );

  const combine = useMemo(() => combineEligibility(selectedRows), [selectedRows]);
  const dismissTargets = useMemo(() => dismissableRows(selectedRows), [selectedRows]);

  function handleCombineSelected() {
    if (!combine.ok) return;
    const [primary, ...rest] = combine.rows;
    actions.combineSelected(primary, rest);
  }

  const toggleRowSelected = useCallback((key: string) => {
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const toggleCombinedExpanded = useCallback((key: string) => {
    setExpandedCombined((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Only when the rows in view actually come from more than one pilot: a
  // single-miner ledger repeating the same name on every line is width the
  // Payee column needs (decision 20261004, "room for long Payee names").
  const showCharacterColumn = new Set(visibleRows.map((dr) => dr.row.characterId)).size > 1;
  const selectableVisible = openRows.filter(isSelectableRow);
  const showSelectColumn = selectableVisible.length > 0;

  const { baseColumns, openColumns, historyColumns } = useTaxColumns({
    isPhone,
    showOreColumn,
    showValueColumn,
    showCharacterColumn,
    showSelectColumn,
    typeNames: data?.typeNames,
    systemSecurity,
    selection,
    expandedCombined,
    toggleRowSelected,
    toggleCombinedExpanded,
    estimatedValueOf,
    systemName,
    payeeDisplayName,
    corpStateLabel,
  });

  const taxSort = useUrlSort(
    'tax.sort',
    TAX_DEFAULT_SORT,
    openColumns.map((c) => c.id)
  );
  const historySort = useUrlSort(
    'tax.historySort',
    TAX_DEFAULT_SORT,
    baseColumns.map((c) => c.id)
  );

  // The table's own cell helpers, so the export reads each row exactly as it
  // is shown.
  const csvColumns = useMemo(
    () =>
      taxCsvColumns(t, {
        showCharacter: showCharacterColumn,
        dateLabel,
        systemName,
        payeeName: (dr) => (dr.assignment ? payeeDisplayName(dr) : null),
        estimatedValue: estimatedValueOf,
        taxOwed: (dr) =>
          dr.assignment && !(dr.corp?.kind === 'row' && dr.corp.view.taxOwed === null)
            ? taxOwedOf(dr)
            : null,
        statusLabel: (dr) => (dr.corp ? corpStateLabel(dr.corp) : undefined),
      }),
    [t, showCharacterColumn, systemName, payeeDisplayName, estimatedValueOf, corpStateLabel]
  );
  const taxExport = useTableExport({
    surface: 'mining-tax',
    rows: visibleRows,
    columns: csvColumns,
    // Open and History are two tables; the default reads only the mounted
    // Open one, so the file would drop every settled record.
    source: 'sorted-rows',
  });

  const payeeManagerDefaultCharacterId =
    characters.find((c) => c.characterId === activeCharacterId)?.characterId ??
    characters[0]?.characterId ??
    null;

  // A corp's book is something to owe on its own: a member with no Payee of their own yet still
  // sees what the book billed.
  const needsFirstPayee =
    data != null &&
    allPayees.length === 0 &&
    !(corpView && corpView.overlay.rows.length > 0) &&
    payeeManagerDefaultCharacterId !== null;

  const duplicateRows =
    data?.entries.filter((row) => (row.duplicateAssignmentIds?.length ?? 0) > 0) ?? [];

  const attentionItems: AttentionItem[] = [];
  if (data) {
    // Per-character re-login, never one flag hiding every other character's
    // data behind a full-page banner — a lapsed alt must stay visible as
    // needing attention, not disappear.
    for (const c of data.reauthCharacters) {
      attentionItems.push({
        id: `reauth:${c.characterId}`,
        tone: 'warning',
        title: t('miningTax.reauthCharacterHint', { character: c.characterName }),
        action: (
          <NeedsConnection>
            <Button
              size="sm"
              onClick={() => void beginGrant(c.characterId, ['getCharacterMining'])}
            >
              {t('miningTax.reauthAction')}
            </Button>
          </NeedsConnection>
        ),
      });
    }
    // An ore type the hub quoted no buy order for is valued at 0, which
    // renders exactly like a cheap ore and silently understates the bill.
    // Named per hub rather than pooled: "no buy orders" is a fact about one
    // order book, and once two Payees bill at two hubs, blaming both for one
    // thin book would be wrong. A hub whose price source could not be reached
    // (offline) is a different fact again; `UnpricedOreDetail` decides per hub.
    if (data.unpricedTypeIds.size > 0) {
      const unreachableHubs = data.datedPrices.unreachableHubs ?? NO_HUBS;
      attentionItems.push({
        id: 'unpriced',
        tone: 'warning',
        title: hasReachableUnpricedHub(data.unpricedByHub, unreachableHubs)
          ? t('miningTax.unpricedTitle')
          : pricesUnavailableLabel,
        detail: (
          <UnpricedOreDetail
            unpricedByHub={data.unpricedByHub}
            unreachableHubs={unreachableHubs}
            typeNames={data.typeNames}
          >
            {renderGapLinks(
              pricingGaps.filter((g) => g.unpriced.length > 0),
              (g) => g.unpriced
            )}
          </UnpricedOreDetail>
        ),
      });
    }
    if (pricingGaps.some((g) => g.sellFallback.length > 0)) {
      attentionItems.push({
        id: 'sell-fallback',
        tone: 'info',
        title: t('miningTax.sellFallbackTitle'),
        detail: (
          <>
            <p>{t('miningTax.sellFallbackHint')}</p>
            {renderGapLinks(
              pricingGaps.filter((g) => g.sellFallback.length > 0),
              (g) => g.sellFallback
            )}
          </>
        ),
      });
    }
    if (duplicateRows.length > 0) {
      attentionItems.push({
        id: 'duplicates',
        tone: 'warning',
        title: t('miningTax.duplicateTitle'),
        detail: (
          <>
            <p>{t('miningTax.duplicateHint')}</p>
            <ul className="space-y-0.5">
              {duplicateRows.map((row) => (
                <li key={`${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`}>
                  {row.characterName} — {row.entry.date} —{' '}
                  {systemLabel(systemNames, row.entry.solarSystemId)}
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }
    // A donation to a corp's book that it could not match to anyone: only the donor can claim it.
    for (const claim of corpView?.claims ?? []) {
      const claimKey = `${claim.corporationId}:${claim.payment.id}`;
      attentionItems.push({
        id: `corp-claim:${claimKey}`,
        tone: 'info',
        title: t('miningTax.corpBook.claim.title', { corp: claim.corpName }),
        detail: (
          <p>
            {t('miningTax.corpBook.claim.detail', {
              amount: formatIsk(claim.payment.amount, 0),
              date: claim.payment.at.slice(0, 10),
              character: claim.characterName,
              corp: claim.corpName,
            })}
            {claimError === claimKey && ` ${t('miningTax.corpBook.claim.failed')}`}
          </p>
        ),
        action: (
          <NeedsConnection>
            <Button
              size="sm"
              disabled={claiming !== null}
              onClick={() =>
                void handleClaim(
                  claim.payment.characterId,
                  claim.corporationId,
                  claim.payment.id,
                  claimKey
                )
              }
            >
              {t('miningTax.corpBook.claim.action')}
            </Button>
          </NeedsConnection>
        ),
      });
    }
    for (const u of data.unclassified) {
      for (const typeId of u.typeIds) {
        attentionItems.push({
          id: `unclassified:${u.characterId}:${typeId}`,
          tone: 'warning',
          title: t('miningTax.attention.unclassifiedOre', {
            character: u.characterName,
            ore: data.typeNames.get(typeId) ?? `#${typeId}`,
          }),
          detail: <p>{t('miningTax.unclassifiedHint')}</p>,
          action: (
            <>
              <Button size="sm" onClick={() => void handleTagAsMoonOre(typeId)}>
                {t('miningTax.tagAsMoonOre')}
              </Button>
              <Button size="sm" onClick={() => void handleTagAsIgnored(typeId)}>
                {t('miningTax.ignoreOreAction')}
              </Button>
            </>
          ),
        });
      }
    }
  }

  // The selection bar's "Link payment": one transfer pays one Payee.
  const selectedPayeeIds = [...new Set(selectedSettleUpRows.map((r) => r.assignment.payeeId))];
  const linkSelectedBlocked =
    selectedSettleUpRows.length === 0
      ? t('miningTax.settleUpBlockedHint')
      : selectedPayeeIds.length > 1
        ? t('miningTax.linkPaymentOnePayeeHint')
        : null;

  /** What a book's rows owe the member right now (Billed and Sent, waiting). */
  const corpOwedNow = useCallback(
    (corporationId: number) =>
      characterFiltered
        .filter((dr) => dr.corp?.kind === 'row' && dr.corp.view.corporationId === corporationId)
        .reduce((sum, dr) => sum + (dr.status === 'outstanding' ? taxOwedOf(dr) : 0), 0),
    [characterFiltered]
  );

  const onAddPayee = useMemo(
    () =>
      payeeManagerDefaultCharacterId !== null
        ? () => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)
        : undefined,
    [payeeManagerDefaultCharacterId]
  );

  const rowClassName = (dr: DisplayRow) =>
    cx(
      dr.status === 'paid' && 'text-text-dim',
      expandedCombined.has(dr.key) && 'sm:[&>td]:align-top'
    );

  return (
    <div className="space-y-4">
      {/*
        The tab's controls ride the page title's own line rather than a strip
        of their own below the tab bar: they act on this tab's whole snapshot,
        which is what `PageHeader.actions` is for. Rendering the header here
        rather than in the route shell is what lets the `DataAgeBadge` read
        `fetchedAt` directly — see the note on `MoonMiningTax`.
      */}
      <PageHeader
        title={t('miningTax.title')}
        meta={data?.fetchedAt ? <DataAgeBadge date={data.fetchedAt} /> : undefined}
        actions={
          <>
            {payeeManagerDefaultCharacterId !== null && (
              <Button
                variant={needsFirstPayee ? 'accent' : 'ghost'}
                onClick={() => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)}
              >
                {t('miningTax.managePayeesAction')}
              </Button>
            )}
            <HeaderMoreMenu>
              <DropdownMenuItem onSelect={() => setOreTagsOpen(true)}>
                {t('miningTax.oreTagsAction')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                {t('pageSettings.menuItem')}
              </DropdownMenuItem>
            </HeaderMoreMenu>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('miningTax.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />
      {tabBar}
      <TabPanel tabsId={tabsId} tabId="tax" className="space-y-4">
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : (
          <>
            {data && data.fromCache && <CachedNotice fetchedAt={data.fetchedAt} />}

            <AttentionStrip items={attentionItems} />

            {/* Until a Payee exists there is nothing to assign an entry to, so
              the balances and ledger would all read as blank. Point at the
              Payees button (outlined in accent while this shows) instead. */}
            {needsFirstPayee ? (
              <EmptyState
                title={t('miningTax.firstPayeeTitle')}
                hint={t('miningTax.firstPayeeHint')}
              />
            ) : (
              <>
                <OwedBalances
                  balances={balances}
                  unassigned={unassigned}
                  unlinkedPaymentCount={linkSuggestions.length}
                  characterNameOf={
                    characters.length > 1
                      ? (balance) =>
                          characters.find((c) => c.characterId === balance.payee.characterId)
                            ?.characterName
                      : undefined
                  }
                  isSoleFilter={isSolePayeeFilter}
                  onFilterPayee={filterToPayee}
                  onSettleUp={(balance) =>
                    isCorpPayeeId(balance.payee.id)
                      ? actions.openCorpPay(corporationOfPayee(balance.payee.id))
                      : settleUpBalance(balance.members)
                  }
                  onLinkPayment={(balance) => actions.openLinkWallet({ payeeId: balance.payee.id })}
                  hideLinkPayment={(balance) => isCorpPayeeId(balance.payee.id)}
                  onAssignNext={assignNext}
                  onReviewPayments={() => actions.openLinkPayment(true)}
                />

                {data && <PendingGroupingNotice characters={characters} />}

                {corpView?.books.map((book) => (
                  <CorpBookSyncNote
                    key={book.loaded.corporationId}
                    book={book}
                    owedNow={corpOwedNow(book.loaded.corporationId)}
                  />
                ))}

                {data && continuations.some((c) => !autoContinue || autoSkip.has(c.next.key)) && (
                  <div className="space-y-2">
                    {continuations
                      .filter((c) => !autoContinue || autoSkip.has(c.next.key))
                      .map((c) => (
                        <ContinueSessionCard
                          key={c.next.key}
                          continuation={c}
                          systemName={systemName(c.next)}
                          payeeName={payeeName(c.previous.payeeId)}
                          typeNames={data.typeNames}
                          busy={busy}
                          autoContinue={autoContinue}
                          onContinue={() => void handleContinue(c)}
                          onChooseOther={() => actions.openDetail(c.next)}
                          onKeepSeparate={() => keepSeparate(c)}
                          onAutoContinueChange={setAutoContinueFromCard}
                        />
                      ))}
                  </div>
                )}

                {/* The filters sit right on top of the Open list they filter
                  first: no "Open" heading between them, since every row in
                  it already carries its status. */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CharacterFilterControl
                      activeCharacterId={activeCharacterId}
                      value={characterFilter}
                      onChange={setCharacterFilter}
                    />

                    {ledgerPayees.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm">
                            {resolvedPayeeFilter === 'all'
                              ? t('miningTax.allPayees')
                              : t('miningTax.payeesSelected', { count: resolvedPayeeFilter.size })}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {ledgerPayees.map((p) => (
                            <DropdownMenuCheckboxItem
                              key={p.id}
                              checked={
                                resolvedPayeeFilter === 'all' || resolvedPayeeFilter.has(p.id)
                              }
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={() => togglePayee(p.id)}
                            >
                              {characters.length > 1
                                ? t('miningTax.payeeOptionWithCharacter', {
                                    payee: p.name,
                                    character:
                                      characters.find((c) => c.characterId === p.characterId)
                                        ?.characterName ?? '',
                                  })
                                : p.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {/* On a phone the stacked cards have no header row to sort
                    from; the picker lives here rather than above the list. */}
                    {isPhone && openRows.length > 1 && (
                      <DataTableSortPicker
                        columns={openColumns}
                        sort={taxSort.sort}
                        onSortChange={taxSort.onSortChange}
                        size="sm"
                      />
                    )}

                    {visibleRows.length > 0 && (
                      <span className="ml-auto">
                        <TableActionsMenu name={t('miningTax.title')} tableExport={taxExport} />
                      </span>
                    )}
                  </div>

                  {/* An empty ledger is EmptyState's to explain below; "nothing
                  open — every entry is paid" would contradict it. */}
                  {visibleRows.length > 0 && (
                    <section aria-labelledby="mining-tax-open">
                      <h2 id="mining-tax-open" className="sr-only">
                        {t('miningTax.sections.open', { count: openRows.length })}
                      </h2>
                      {openRows.length === 0 ? (
                        <p className="rounded-xs border border-dashed border-line px-3 py-3 text-xs text-text-dim">
                          {t('miningTax.sections.openEmpty')}
                        </p>
                      ) : (
                        <Panel padded={false}>
                          <div className="overflow-x-auto">
                            <DataTable
                              {...taxExport.tableProps}
                              columns={openColumns}
                              rows={openRows}
                              className="dt-dense-lead sm:table-fixed"
                              rowKey={(dr) => dr.key}
                              label={t('miningTax.sections.openLabel')}
                              {...taxSort}
                              stackLayout="dense"
                              rowClassName={rowClassName}
                              onRowClick={actions.openDetail}
                            />
                          </div>
                        </Panel>
                      )}
                    </section>
                  )}
                </div>

                {historyRows.length > 0 && (
                  <section aria-labelledby="mining-tax-history" className="space-y-2">
                    <h2 id="mining-tax-history" className={eyebrowClassName}>
                      {t('miningTax.sections.history')}
                    </h2>
                    <Panel padded={false}>
                      <div className="overflow-x-auto">
                        <DataTable
                          columns={historyColumns}
                          rows={historyRows}
                          // Months are sections here, not folded duplicates:
                          // their entries line up with Open's, unindented.
                          className="dt-flat-groups sm:table-fixed"
                          rowKey={(dr) => dr.key}
                          label={t('miningTax.sections.history')}
                          {...historySort}
                          stackLayout="dense"
                          rowClassName={rowClassName}
                          onRowClick={actions.openDetail}
                          groupBy={{
                            key: (dr) => (dateRangeOf(dr).at(-1) ?? dr.row.entry.date).slice(0, 7),
                            allWidths: true,
                            minSize: 1,
                            // The newest month opens; older ones stay folded.
                            defaultExpanded: (rows) =>
                              (dateRangeOf(rows[0]).at(-1) ?? '').slice(0, 7) === history[0]?.month,
                            renderHeader: (rows) => (
                              <HistoryMonthHeader
                                month={(dateRangeOf(rows[0]).at(-1) ?? '').slice(0, 7)}
                                count={rows.length}
                                taxTotal={rows.reduce(
                                  (sum, dr) => sum + (dr.assignment ? taxOwedOf(dr) : 0),
                                  0
                                )}
                              />
                            ),
                          }}
                        />
                      </div>
                    </Panel>
                  </section>
                )}

                {visibleRows.length === 0 && (
                  <EmptyState title={t('miningTax.emptyTitle')} hint={t('miningTax.emptyHint')} />
                )}

                {/* Pinned above the phone tab bar (and to the bottom of the
                  viewport on desktop), so the bulk actions stay in reach
                  wherever the ticked row sits in a long ledger. */}
                {selectedRows.length > 0 && (
                  <div
                    ref={selectionToolbarRef}
                    className="sticky bottom-[var(--bottom-nav-clearance)] z-30 md:bottom-3"
                  >
                    <SelectionToolbar
                      selectedCount={selectedRows.length}
                      canSelectAll={selectableVisible.some((dr) => !selection.has(dr.key))}
                      onSelectAll={() =>
                        setSelection(new Set(selectableVisible.map((dr) => dr.key)))
                      }
                      onClear={clearSelection}
                      settleUpCount={selectedSettleUpRows.length}
                      onSettleUp={() => openSettleUpFor(selectedSettleUpRows)}
                      combine={combine}
                      onCombine={handleCombineSelected}
                      dismissCount={dismissTargets.length}
                      onDismiss={() => actions.openBulkDismiss(true)}
                      linkPaymentBlockedReason={linkSelectedBlocked}
                      onLinkPayment={() => {
                        const payeeId = selectedPayeeIds[0];
                        if (!payeeId) return;
                        actions.openLinkWallet({
                          payeeId,
                          members: settleUpMembers(selectedRows),
                        });
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {toast && (
          <Toast
            message={toast.message}
            undo={
              toast.onUndo
                ? { label: t('miningTax.continue.undo'), onUndo: toast.onUndo }
                : undefined
            }
            onClose={() => setToast(null)}
          />
        )}

        {oreTagsOpen && (
          <TypeOverridesDialog
            open={oreTagsOpen}
            onClose={() => setOreTagsOpen(false)}
            onChanged={refresh}
          />
        )}

        <PageSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          pageName={t('miningTax.title')}
          section="miningTax"
        >
          <MiningTaxSettingsForm onAutoContinueChange={setAutoContinueFromCard} />
        </PageSettingsModal>

        {payeeManagerCharacterId !== null && (
          <Suspense fallback={null}>
            <PayeeManagerDialog
              open={payeeManagerCharacterId !== null}
              onClose={() => setPayeeManagerCharacterId(null)}
              characters={characters}
              payeesByCharacter={data?.payeesByCharacter ?? NO_PAYEES_BY_CHARACTER}
              initialCharacterId={payeeManagerCharacterId}
              onChanged={refresh}
              owedByPayee={owedByPayee}
              systemsByPayee={payeeSystems}
              systemNames={systemNames}
            />
          </Suspense>
        )}

        <TaxDialogsHost
          store={store}
          actions={actions}
          hasData={Boolean(data)}
          typeNames={data?.typeNames ?? NO_NAMES}
          systemNames={systemNames}
          datedPrices={datedPrices}
          unreachableHubs={data?.datedPrices.unreachableHubs}
          refresh={refresh}
          loading={loading}
          continuing={continuing}
          characterCount={characters.length}
          allDisplayRows={allDisplayRows}
          characterFiltered={characterFiltered}
          everyAssignment={everyAssignment}
          allPayees={allPayees}
          payeeById={payeeById}
          balances={balances}
          madePayments={madePayments}
          paymentSources={paymentSources}
          linkSuggestions={linkSuggestions}
          corpView={corpView}
          corpStateHint={corpStateHint}
          corpOwedNow={corpOwedNow}
          dismissTargets={dismissTargets}
          showCharacterColumn={showCharacterColumn}
          estimatedValueOf={estimatedValueOf}
          systemName={systemName}
          systemSecurityOf={systemSecurityOf}
          payeeDisplayName={payeeDisplayName}
          settleUpRowsFor={settleUpRowsFor}
          pricesFor={pricesFor}
          priceSourcesFor={priceSourcesFor}
          onClearSelection={clearSelection}
          onAddPayee={onAddPayee}
        />
      </TabPanel>
    </div>
  );
}

/** A History month's fold row: which month, how many entries, what was paid in it. */
function HistoryMonthHeader({
  month,
  count,
  taxTotal,
}: {
  month: string;
  count: number;
  taxTotal: number;
}) {
  const { t, i18n } = useTranslation();
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold">{label}</span>
      <span className="text-[0.6875rem] text-text-dim tabular-nums">
        {t('miningTax.sections.monthSummary', { count, amount: formatIsk(taxTotal, 0) })}
      </span>
    </span>
  );
}
