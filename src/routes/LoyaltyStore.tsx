/**
 * One corporation's LP store (Wallet's Loyalty Points table links here by
 * `corporation_id`): every offer ranked by ISK/LP — profit divided by the LP
 * each offer costs, since LP (not ISK) is the resource a character can't
 * just make more of. A ranked list on the left, a full profit breakdown for
 * the selected offer on the right; on a phone the breakdown opens as a
 * bottom sheet instead of a second column. See
 * src/features/loyalty/useLoyaltyStoreOffers.ts for how the numbers are
 * assembled.
 *
 * The landing search opens any NPC corporation's store, LP or not; an open
 * store's "Change store" link returns to it (`/market/lp-store` with no
 * corporation is the landing state).
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { LpValueSettingsForm } from '@/features/settings/LpValueSettingsForm';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CorporationLink } from '@/features/entities/EntityLink';
import { industryTabHref } from '@/features/industry/industryTabs';
import { useTranslation } from 'react-i18next';
import {
  Button,
  buttonClassName,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IskAmount,
  Modal,
  Panel,
  PageHeader,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  StatChips,
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  LOYALTY_STORE_OFFERS_COLUMN_IDS,
  loyaltyStoreOffersColumnsStore,
  type LoyaltyStoreOffersColumnId,
} from './loyaltyStoreColumns';
import { loyaltyOfferCsvColumns, loyaltyOfferMaterialsCsvColumns } from './loyaltyStoreCsv';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, optionalIdParam, textParam } from '@/lib/urlState';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { useMarketHub } from '@/features/market/hub';
import { usePriceBasis, type PriceBasis } from '@/features/loyalty/priceBasis';
import { useLpBasis, type LpBasis } from '@/features/loyalty/lpBasis';
import { concordRate, iskPerConcordLp, type ConcordRate } from '@/engine/loyalty/concordExchange';
import { loadLpCorporations } from '@/sde/loadMarketSde';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS } from '@/market/hubs';
import { nameForType } from '@/features/industry/blueprintCatalog';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useLoyaltyStoreOffers } from '@/features/loyalty/useLoyaltyStoreOffers';
import { LpStoreSearch } from '@/features/loyalty/LpStoreSearch';
import type { LpSearchCrumbState } from '@/features/loyalty/itemSearch';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { applyBlueprintPriceSeed } from '@/features/industry/planSeed';
import { lpBlueprintPickPrice } from '@/features/industry/blueprintPurchaseOffers';

function iskPerLpTone(value: number | null): string {
  return value === null ? 'text-text-dim' : iskToneClass(value);
}

/** Module-level so the table's windowing and row memo see one stable function. */
const offerRowKey = (row: LoyaltyOfferRow) => row.offer.offer_id;

/**
 * Item name: plain text. The row's click selects it for the detail pane, so
 * the name is not a link (DESIGN.md §6c); `OfferDetail`'s View in Market is
 * the Market link. A blueprint row is labelled with the product that button
 * opens; the BP badge beside it still marks the row as a blueprint.
 */
function LoyaltyItemName({ row }: { row: LoyaltyOfferRow }) {
  const { typeId, itemName } = resolveLoyaltyRowItem(row);
  return <span className={entityLinkClassName()}>{typeId === null ? row.itemName : itemName}</span>;
}

/**
 * A blueprint offer's row is the *blueprint*, but every market/menu action on
 * it targets the manufactured product — shared by `OfferDetail`'s own
 * View in Market/Plan in Industry buttons and the row's context menu, so the
 * two can't drift on which field means "the real item".
 */
function resolveLoyaltyRowItem(row: LoyaltyOfferRow): { typeId: number | null; itemName: string } {
  if (!row.isBlueprint) return { typeId: row.offer.type_id, itemName: row.itemName };
  return { typeId: row.productTypeId, itemName: row.productName ?? row.itemName };
}

interface OfferDetailProps {
  row: LoyaltyOfferRow;
  catalog: BlueprintCatalog | null;
  hubId: string;
  hubName: string;
  priceBasis: PriceBasis;
  lpBasis: LpBasis;
  concord: ConcordRate | null;
  concordPending: boolean;
  playerLp: number;
  useOwnMaterials: boolean;
  onToggleUseOwnMaterials: () => void;
  onPlanInIndustry: (row: LoyaltyOfferRow) => Promise<void>;
}

const EMPTY_MATERIALS: readonly ResolvedMaterial[] = [];

function OfferDetail({
  row,
  catalog,
  hubId,
  hubName,
  priceBasis,
  lpBasis,
  concord,
  concordPending,
  playerLp,
  useOwnMaterials,
  onToggleUseOwnMaterials,
  onPlanInIndustry,
}: OfferDetailProps) {
  const { t } = useTranslation();
  const { typeId: marketTypeId, itemName: displayName } = resolveLoyaltyRowItem(row);
  const { profit } = row;
  const shownIskPerLp =
    lpBasis === 'concord'
      ? concord
        ? iskPerConcordLp(profit.iskPerLp, concord.rate)
        : null
      : profit.iskPerLp;

  const materialColumns = useMemo<DataTableColumn<ResolvedMaterial>[]>(
    () => [
      {
        id: 'name',
        header: t('loyaltyStore.materialColName'),
        primary: true,
        sortValue: (material) =>
          catalog ? nameForType(catalog, material.typeID) : `#${material.typeID}`,
        render: (material) => (
          <MarketItemLink typeId={material.typeID} hubId={hubId}>
            {catalog ? nameForType(catalog, material.typeID) : `#${material.typeID}`}
          </MarketItemLink>
        ),
      },
      {
        id: 'needed',
        header: t('loyaltyStore.materialColNeeded'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        sortValue: (material) => material.quantity,
        render: (material) => material.quantity.toLocaleString(),
      },
      {
        id: 'owned',
        header: t('loyaltyStore.materialColOwned'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        sortValue: (material) => material.ownedQuantity,
        render: (material) => material.ownedQuantity.toLocaleString(),
      },
      {
        id: 'buyCost',
        header: t('loyaltyStore.materialColBuyCost'),
        align: 'right',
        className: 'tabular-nums text-text',
        sortValue: (material) => material.lineCost,
        render: (material) => <IskAmount value={material.lineCost} decimals={0} />,
      },
    ],
    [t, catalog, hubId]
  );
  const materialCsvColumns = useMemo(
    () =>
      loyaltyOfferMaterialsCsvColumns(t, (typeId) =>
        catalog ? nameForType(catalog, typeId) : `#${typeId}`
      ),
    [t, catalog]
  );
  const materialsExport = useTableExport({
    surface: 'lp-offer-materials',
    rows: row.build?.materials ?? EMPTY_MATERIALS,
    columns: materialCsvColumns,
    qualifier: displayName,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium text-text">{displayName}</h3>
        {row.isBlueprint && <p className="text-xs text-text-dim">{row.itemName}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {marketTypeId !== null && (
          <MarketItemLink
            typeId={marketTypeId}
            hubId={hubId}
            className={buttonClassName({ variant: 'ghost', size: 'sm' })}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon.Market size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('loyaltyStore.viewInMarket')}
            </span>
          </MarketItemLink>
        )}
        {row.isBlueprint && row.productTypeId !== null && (
          <Button variant="ghost" size="sm" onClick={() => void onPlanInIndustry(row)}>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Industry size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('loyaltyStore.planInIndustry')}
            </span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <div className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t(
              lpBasis === 'concord' ? 'loyaltyStore.colIskPerConcordLp' : 'loyaltyStore.colIskPerLp'
            )}
          </div>
          <div className={`text-3xl font-semibold tabular-nums ${iskPerLpTone(shownIskPerLp)}`}>
            {lpBasis === 'concord' && !concord && !concordPending
              ? t('loyaltyStore.noConcordExchange')
              : shownIskPerLp === null
                ? '—'
                : shownIskPerLp.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('loyaltyStore.netProfit')}
          </div>
          <div className={`text-xl font-semibold tabular-nums ${iskPerLpTone(profit.profit)}`}>
            {profit.profit === null ? '—' : <IskAmount value={profit.profit} decimals={0} />}
          </div>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between gap-4 text-text-dim">
          <dt>
            {t(priceBasis === 'buy' ? 'loyaltyStore.buyPriceAt' : 'loyaltyStore.sellPriceAt', {
              hub: hubName,
            })}
          </dt>
          <dd className="tabular-nums text-text">
            {profit.revenue === null ? '—' : formatIsk(profit.revenue)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 text-text-dim">
          <dt>{t('loyaltyStore.storeCost')}</dt>
          <dd className="tabular-nums text-text">
            {row.offer.lp_cost.toLocaleString()} LP + {formatIsk(row.offer.isk_cost)} ISK
          </dd>
        </div>
        {row.requiredItems.length > 0 && (
          <>
            <div className="flex justify-between gap-4 text-text-dim">
              <dt>{t('loyaltyStore.requiredItems')}</dt>
              <dd className="tabular-nums text-text">
                {row.requiredItemsCost === null ? (
                  <span className="text-warning">{t('loyaltyStore.requiredItemsNotPriced')}</span>
                ) : (
                  formatIsk(row.requiredItemsCost)
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 pl-3">
              {row.requiredItems.map((item) => (
                <div
                  key={item.typeId}
                  className="flex justify-between gap-4 text-[0.6875rem] text-text-dim"
                >
                  <dt>
                    {item.quantity.toLocaleString()} ×{' '}
                    <MarketItemLink typeId={item.typeId} hubId={hubId}>
                      {item.name}
                    </MarketItemLink>
                  </dt>
                  <dd className="tabular-nums">
                    {item.unitPrice === null ? (
                      <span className="text-warning">
                        {t('loyaltyStore.requiredItemsNotPriced')}
                      </span>
                    ) : (
                      formatIsk(item.unitPrice * item.quantity)
                    )}
                  </dd>
                </div>
              ))}
            </div>
          </>
        )}
        {row.isBlueprint && row.build && (
          <div className="flex justify-between gap-4 text-text-dim">
            <dt>{t('loyaltyStore.materials')}</dt>
            <dd className="tabular-nums text-text">
              {formatIsk(row.build.materialCost + row.build.jobFee.total)}
            </dd>
          </div>
        )}
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold text-text">
          <dt>{t('loyaltyStore.netProfit')}</dt>
          <dd className={`tabular-nums ${iskPerLpTone(profit.profit)}`}>
            {profit.profit === null ? '—' : formatIsk(profit.profit)}
          </dd>
        </div>
      </dl>

      {!profit.affordableLp && (
        <p className="text-xs text-text-dim">
          {t('loyaltyStore.needMoreLp', {
            amount: (row.offer.lp_cost - playerLp).toLocaleString(),
          })}
        </p>
      )}
      {profit.profit === null && (
        <p className="text-xs text-warning">
          {/* A required item with no hub price is a real, distinct cause from
              a material or the product itself lacking one (row.build's
              `unpricedMaterials` / a null `profit.revenue`) — naming the
              wrong one would send the player looking for a Jita order that
              was never missing. `requiredItemsCost` is the same null the
              engine already used to null `profit.profit`, so this reads the
              actual cause rather than re-deriving it. */}
          {t(
            row.requiredItemsCost === null
              ? 'loyaltyStore.unpriceableRequiredItem'
              : 'loyaltyStore.unpriceable'
          )}
        </p>
      )}

      {row.isBlueprint && row.build && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <FilterChip
              label={t('loyaltyStore.useOwnMaterials')}
              selected={useOwnMaterials}
              onToggle={onToggleUseOwnMaterials}
            />
            <TableActionsMenu name={t('loyaltyStore.materials')} tableExport={materialsExport} />
          </div>
          <p className="text-[0.6875rem] text-text-dim">{t('loyaltyStore.useOwnMaterialsHint')}</p>
          <div className="overflow-x-auto">
            <DataTable
              {...materialsExport.tableProps}
              label={t('loyaltyStore.materials')}
              columns={materialColumns}
              rows={row.build.materials}
              rowKey={(material) => material.typeID}
              density="compact"
              responsive="table"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The filter row's three fields, in the URL (ADR 0015, issue #1302): all
 * three as one `useUrlParams` group, so a click and a keystroke in the same
 * update write together. `affordableOnly` defaults `true` — the offer list's
 * own opening state — so it is the one omitted from the URL when left alone.
 */
const FILTER_PARAMS = {
  search: textParam(),
  affordableOnly: boolParam(true),
  blueprintsOnly: boolParam(false),
  /** The selected offer: a link (BPC Sourcing's LP rows) arrives with one already picked. */
  offer: optionalIdParam(),
};

const OFFERS_SORT = { columnId: 'iskPerLp', direction: 'desc' } as const;

/** The header's gear for the one setting this page's numbers lean on, LP Value. */
function LpStoreActions() {
  const { t } = useTranslation();
  return (
    <>
      <PageSettingsButton pageName={t('loyaltyStore.title')} section="market">
        <LpValueSettingsForm />
      </PageSettingsButton>
    </>
  );
}

/**
 * LP Store is a Market tab, but its own route outranks Market's, so the page
 * draws Market's tab bar itself. Every other tab is a path under `/market`.
 */
function MarketTabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Tabs
      label={t('market.title')}
      value="lp-store"
      onChange={(id) =>
        navigate(tabPath(MARKET_TABS, id as (typeof MARKET_TABS.tabs)[number]['id']))
      }
      tabs={MARKET_TABS.tabs
        .filter((tab) => tab.id !== 'history/transactions')
        .map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
    />
  );
}

/** `/market/lp-store` with no corporation chosen yet: the item-first search. */
function LoyaltyStoreLanding() {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(LANDING_PARAMS);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3">
      <PageHeader title={t('loyaltyStore.title')} actions={<LpStoreActions />} />
      <MarketTabBar />
      <LpStoreSearch query={params.q} onQueryChange={(q) => setParams({ q })} />
    </div>
  );
}

/** The search box's text, in the URL (ADR 0015) so a search can be linked and Back returns to it. */
const LANDING_PARAMS = { q: textParam() };

const CRUMB_CLASS =
  'inline-flex min-h-11 items-center gap-1 rounded-xs px-2 text-xs text-text-dim hover:text-text active:text-text-dim md:min-h-0';

/**
 * The links above an open store: back to the search it was opened from (a
 * result row carries the query in the location state), and "Change store" to
 * the landing search, the way to switch stores.
 */
function StoreCrumbs() {
  const { t } = useTranslation();
  const state = useLocation().state as Partial<LpSearchCrumbState> | null;
  const q = state?.from === 'lp-search' ? (state.q ?? '') : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 self-start">
      {q !== null && (
        <Link
          to={q === '' ? '/market/lp-store' : `/market/lp-store?q=${encodeURIComponent(q)}`}
          className={CRUMB_CLASS}
        >
          <span aria-hidden="true">‹</span>
          {t('loyaltyStore.search.crumb')}
        </Link>
      )}
      <Link to="/market/lp-store" className={CRUMB_CLASS}>
        <span aria-hidden="true">‹</span>
        {t('loyaltyStore.search.changeStore')}
      </Link>
    </div>
  );
}

/**
 * The route: `/market/lp-store` (landing) or `/market/lp-store/:corporationId`.
 * Keyed on the corporation so switching stores remounts the
 * page — no previous store's offers, selection or loaded state carried over
 * under the new store's URL.
 */
export function LoyaltyStore() {
  const { corporationId: corporationIdParam } = useParams<{ corporationId?: string }>();
  const corporationId = Number(corporationIdParam);
  if (corporationIdParam === undefined || !Number.isInteger(corporationId) || corporationId <= 0) {
    return <LoyaltyStoreLanding />;
  }
  return <LoyaltyStoreView key={corporationId} corporationId={corporationId} />;
}

function LoyaltyStoreView({ corporationId }: { corporationId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const hydrateHub = useMarketHub((s) => s.hydrate);
  const hubId = useMarketHub((s) => s.value);
  const setHubId = useMarketHub((s) => s.setValue);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

  const hydratePriceBasis = usePriceBasis((s) => s.hydrate);
  const priceBasis = usePriceBasis((s) => s.value);
  const setPriceBasis = usePriceBasis((s) => s.setValue);
  useEffect(() => {
    void hydratePriceBasis();
  }, [hydratePriceBasis]);

  const hydrateLpBasis = useLpBasis((s) => s.hydrate);
  const lpBasis = useLpBasis((s) => s.value);
  const setLpBasis = useLpBasis((s) => s.setValue);
  useEffect(() => {
    void hydrateLpBasis();
  }, [hydrateLpBasis]);

  // The exchange rate is a faction rule keyed off the corporation's faction,
  // which the offers feed does not carry: it comes from the bundled LP corporation list.
  // `undefined` until the list loads (or when it fails), so a corporation that does have an
  // exchange never reads "no exchange" in the meantime.
  const [concordState, setConcord] = useState<ConcordRate | null | undefined>(undefined);
  const concord = concordState ?? null;
  const concordPending = concordState === undefined;
  useEffect(() => {
    let live = true;
    void loadLpCorporations()
      .then((corps) => {
        const corp = corps.find((c) => c.id === corporationId);
        if (live) setConcord(corp ? concordRate(corp) : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [corporationId]);

  const {
    corpName,
    offersFetchedAt,
    offersFromCache,
    offersError,
    reloadOffers,
    rows,
    catalog,
    playerLp,
    hub,
    ready,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
  } = useLoyaltyStoreOffers(corporationId);

  const offersColumnVisibility = useColumnVisibility(
    loyaltyStoreOffersColumnsStore,
    LOYALTY_STORE_OFFERS_COLUMN_IDS
  );

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const { search, affordableOnly, blueprintsOnly } = filterParams;
  // Rows filter on a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the search box keeps the immediate one.
  const rowsSearch = useDeferredValue(search);
  const selectedOfferId = filterParams.offer;
  // A phone arriving on a linked offer opens its breakdown straight away.
  const [sheetOpen, setSheetOpen] = useState(() => selectedOfferId !== null && !isDesktop);

  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const itemActions = usePageItemActions({ activeCharacterId });

  const filteredRows = useMemo(() => {
    const q = rowsSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (affordableOnly && !row.profit.affordableLp) return false;
      if (blueprintsOnly && !row.isBlueprint) return false;
      if (q && !row.itemName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, rowsSearch, affordableOnly, blueprintsOnly]);

  const affordableCount = useMemo(
    () => rows.filter((row) => row.profit.affordableLp).length,
    [rows]
  );

  // No fallback to "the top row" here: `DataTable` sorts its own displayed
  // copy independently of `filteredRows`' order, so a fallback tied to this
  // array's order can point at a row that no longer reads as "first" once
  // the table itself is sorted differently. The prompt below stands until an
  // explicit click picks a row.
  const selectedRow = filteredRows.find((row) => row.offer.offer_id === selectedOfferId);

  function selectRow(row: LoyaltyOfferRow) {
    setFilterParams({ offer: row.offer.offer_id });
    if (!isDesktop) setSheetOpen(true);
  }

  /**
   * Opens the product's Build Plan with this redemption as its Blueprint
   * Acquisition — the pilot is in the LP Store looking at it, so that is
   * where the blueprint comes from. A redemption that can't be priced (a
   * turn-in with no hub price) opens the plan unseeded, to price itself.
   */
  async function planInIndustry(row: LoyaltyOfferRow) {
    if (row.productTypeId === null) return;
    const params = new URLSearchParams({ product: String(row.productTypeId) });
    applyBlueprintPriceSeed(
      params,
      await lpBlueprintPickPrice(row.offer, corporationId, getTradeHub(hubId) ?? DEFAULT_TRADE_HUB)
    );
    navigate(`${industryTabHref('plans')}?${params.toString()}`);
  }

  // Stable, so the offers table's memoized rows skip re-rendering on every page render.
  const rowContextMenu = useCallback(
    (row: LoyaltyOfferRow, tr: ReactElement) => {
      const { typeId, itemName } = resolveLoyaltyRowItem(row);
      if (typeId === null) return tr;
      // `catalog` is always resolved by the time a row exists to right-click —
      // `useLoyaltyStoreOffers` gates `ready` on `catalog !== null` — so this
      // never needs the lazy-load `onOpenChange` wiring the Market/Assets menus
      // use; `?? null` collapsing "not loaded" into "no blueprint" is safe here.
      const blueprintTypeID = catalog?.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
      return (
        <ItemContextMenu typeId={typeId} itemName={itemName} blueprintTypeID={blueprintTypeID}>
          {tr}
        </ItemContextMenu>
      );
    },
    [catalog]
  );
  // `DataTable` draws the selected row itself from `selectedRowKey`; it keys on the
  // selected id rather than `selectedRow`, so a selected offer filtered out of
  // `filteredRows` simply has no row to mark.

  // The identity column (never hidden) plus the optional columns the picker
  // controls, in table order — `LOYALTY_STORE_OFFERS_COLUMN_IDS`' own order.
  // Memoized so the `sortValue`s `DataTable` keys its sort on keep their
  // identity across renders (a keystroke in the search box re-renders this).
  const shownIskPerLp = useCallback(
    (row: LoyaltyOfferRow): number | null =>
      lpBasis === 'concord'
        ? concord
          ? iskPerConcordLp(row.profit.iskPerLp, concord.rate)
          : null
        : row.profit.iskPerLp,
    [lpBasis, concord]
  );
  const optionalOfferColumns = useMemo<
    Record<LoyaltyStoreOffersColumnId, DataTableColumn<LoyaltyOfferRow>>
  >(
    () => ({
      profit: {
        id: 'profit',
        header: t('loyaltyStore.colProfit'),
        align: 'right',
        sortValue: (row) => row.profit.profit ?? undefined,
        cellClassName: (row) => iskPerLpTone(row.profit.profit),
        render: (row) =>
          row.profit.profit === null ? '—' : <IskAmount value={row.profit.profit} decimals={0} />,
      },
      iskPerLp: {
        id: 'iskPerLp',
        header: t(
          lpBasis === 'concord' ? 'loyaltyStore.colIskPerConcordLp' : 'loyaltyStore.colIskPerLp'
        ),
        align: 'right',
        headerClassName: 'whitespace-nowrap',
        sortValue: (row) => shownIskPerLp(row) ?? undefined,
        cellClassName: (row) => `font-semibold tabular-nums ${iskPerLpTone(shownIskPerLp(row))}`,
        render: (row) => {
          if (lpBasis === 'concord' && concordPending) return '—';
          if (lpBasis === 'concord' && !concord) return t('loyaltyStore.noConcordExchange');
          const value = shownIskPerLp(row);
          return value === null ? '—' : value.toFixed(1);
        },
      },
    }),
    [t, lpBasis, concord, concordPending, shownIskPerLp]
  );
  const itemColumn = useMemo<DataTableColumn<LoyaltyOfferRow>>(
    () => ({
      id: 'item',
      header: t('loyaltyStore.colItem'),
      primary: true,
      sortValue: (row) => row.itemName,
      render: (row) => (
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <LoyaltyItemName row={row} />
            {row.isBlueprint && (
              // `shrink-0` + `whitespace-nowrap`: as a flex item next to a
              // long item name the badge was being squeezed until "BP" broke
              // across two lines, one letter each.
              <span className="shrink-0 px-1 text-[0.6875rem] font-bold tracking-widest whitespace-nowrap text-warning uppercase">
                BP
              </span>
            )}
          </span>
          <span className="text-[0.6875rem] text-text-dim">
            {row.offer.lp_cost.toLocaleString()} LP +{' '}
            <IskAmount value={row.offer.isk_cost} decimals={0} />
          </span>
        </span>
      ),
    }),
    [t]
  );
  const isOfferColumnVisible = offersColumnVisibility.isVisible;
  const columns = useMemo<DataTableColumn<LoyaltyOfferRow>[]>(
    () => [
      itemColumn,
      ...LOYALTY_STORE_OFFERS_COLUMN_IDS.filter(isOfferColumnVisible).map(
        (id) => optionalOfferColumns[id]
      ),
    ],
    [itemColumn, optionalOfferColumns, isOfferColumnVisible]
  );
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const offersSortProps = useUrlSort('sort', OFFERS_SORT, [
    'item',
    ...LOYALTY_STORE_OFFERS_COLUMN_IDS,
  ]);
  // Every column, whatever the picker hides.
  const offersCsvColumns = useMemo(() => loyaltyOfferCsvColumns(t), [t]);
  const offersExport = useTableExport({
    surface: 'lp-offers',
    rows: filteredRows,
    columns: offersCsvColumns,
    qualifier: corpName ?? undefined,
  });

  const list = (
    <Panel
      title={t('loyaltyStore.title')}
      wrapMeta
      meta={
        ready && (
          <span className="flex min-w-0 items-center gap-2 text-[0.6875rem] text-text-dim max-md:basis-full">
            <span className="hidden text-xs tabular-nums md:inline">
              {filteredRows.length} / {t('loyaltyStore.offerCount', { count: rows.length })}
            </span>
            <span data-testid="lp-basis-readout" className="min-w-0 truncate">
              {[
                (getTradeHub(hubId) ?? DEFAULT_TRADE_HUB).systemName,
                t(
                  priceBasis === 'buy'
                    ? 'loyaltyStore.priceBasisBuyShort'
                    : 'loyaltyStore.priceBasisSellShort'
                ),
                ...(lpBasis === 'concord' ? [t('loyaltyStore.lpBasisConcord')] : []),
              ].join(' · ')}
            </span>
          </span>
        )
      }
      actions={
        ready &&
        filteredRows.length > 0 && (
          <TableActionsMenu name={t('loyaltyStore.title')} tableExport={offersExport} />
        )
      }
      padded={false}
      className={isDesktop ? 'w-80 shrink-0 xl:w-[28rem]' : undefined}
    >
      {offersError ? (
        <EmptyState
          title={t('loyaltyStore.errorTitle')}
          hint={t('loyaltyStore.errorHint')}
          action={
            <Button size="sm" onClick={reloadOffers}>
              {t('loyaltyStore.retry')}
            </Button>
          }
        />
      ) : !ready ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? t('loyaltyStore.emptyTitle') : t('loyaltyStore.noMatchTitle')}
          hint={rows.length === 0 ? t('loyaltyStore.emptyHint') : t('loyaltyStore.noMatchHint')}
          action={
            rows.length > 0 && (search.trim() !== '' || affordableOnly || blueprintsOnly) ? (
              <Button
                size="sm"
                onClick={() =>
                  setFilterParams({ search: '', affordableOnly: false, blueprintsOnly: false })
                }
              >
                {t('common.resetFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {lpBasis === 'concord' && !concordPending && (
            <p className="border-b border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
              {concord
                ? t(
                    concord.basis === 'assumed'
                      ? 'loyaltyStore.concordRateAssumed'
                      : 'loyaltyStore.concordRateVerified',
                    { rate: concord.rate }
                  )
                : t('loyaltyStore.noConcordExchangeNote')}{' '}
              {t('loyaltyStore.concordExchangeHelp')}
            </p>
          )}
          {priceBasis === 'sell' && (
            <AssumesBaseStandingsNote
              className="border-b border-line px-3"
              hint={t('loyaltyStore.assumesBaseStandingsHint')}
            />
          )}
          <DataTable
            {...offersExport.tableProps}
            label={t('loyaltyStore.title')}
            columns={columns}
            rows={filteredRows}
            rowKey={offerRowKey}
            density="compact"
            virtualize="auto"
            sort={offersSortProps.sort}
            onSortChange={offersSortProps.onSortChange}
            mobileSort
            stackSummary={t('loyaltyStore.offerCount', { count: filteredRows.length })}
            onRowClick={selectRow}
            rowContextMenu={rowContextMenu}
            rowMoreActions
            selectedRowKey={selectedOfferId}
          />
        </>
      )}
    </Panel>
  );

  const detail = selectedRow ? (
    <OfferDetail
      row={selectedRow}
      catalog={catalog}
      hubId={hub.id}
      hubName={hub.name}
      priceBasis={priceBasis}
      lpBasis={lpBasis}
      concord={concord}
      concordPending={concordPending}
      playerLp={playerLp}
      useOwnMaterials={useOwnMaterialsFor.has(selectedRow.offer.offer_id)}
      onToggleUseOwnMaterials={() => toggleUseOwnMaterials(selectedRow.offer.offer_id)}
      onPlanInIndustry={planInIndustry}
    />
  ) : (
    <p className="p-4 text-xs text-text-dim">{t('loyaltyStore.selectPrompt')}</p>
  );

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <StoreCrumbs />
        <PageHeader
          title={corpName ?? t('loyaltyStore.title')}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              {offersFetchedAt && <DataAgeBadge date={offersFetchedAt} />}
              <CorporationLink id={corporationId} className="text-xs">
                {t('loyaltyStore.corporationInfo')}
              </CorporationLink>
              <StatChips>
                <StatChip
                  label={t('loyaltyStore.yourLp')}
                  value={playerLp.toLocaleString()}
                  tone="accent"
                  emphasis
                />
              </StatChips>
            </div>
          }
          actions={<LpStoreActions />}
        />
        <MarketTabBar />

        <FilterBar
          value={{ hubId, priceBasis, lpBasis, affordableOnly, blueprintsOnly }}
          onChange={(next) => {
            // Persisted preferences (hub, price basis) are written here and only
            // here, so a Cancel in the mobile sheet never has a store write to
            // roll back — the draft was local until this point.
            if (next.hubId !== hubId) void setHubId(next.hubId);
            if (next.priceBasis !== priceBasis) void setPriceBasis(next.priceBasis);
            if (next.lpBasis !== lpBasis) void setLpBasis(next.lpBasis);
            setFilterParams({
              affordableOnly: next.affordableOnly,
              blueprintsOnly: next.blueprintsOnly,
            });
          }}
          activeCount={(affordableOnly ? 1 : 0) + (blueprintsOnly ? 1 : 0)}
          search={
            <SearchInput
              placeholder={t('loyaltyStore.searchPlaceholder')}
              value={search}
              onChange={(e) => setFilterParams({ search: e.target.value })}
              className="min-w-40 flex-1"
            />
          }
          actions={
            <ColumnPickerMenu
              available={LOYALTY_STORE_OFFERS_COLUMN_IDS}
              visible={offersColumnVisibility.visible}
              columnsById={optionalOfferColumns}
              onToggle={offersColumnVisibility.toggle}
              buttonLabel={t('common.columnsButton')}
              menuTitle={t('common.columnsMenuTitle')}
              onReset={offersColumnVisibility.reset}
              resetLabel={t('common.resetColumns')}
            />
          }
        >
          {(draft, setDraft) => (
            <>
              {/* Radix, to match the revenue-basis select beside it: side by side,
                two selects that open into different-looking lists read as a seam. */}
              <FilterField label={t('loyaltyStore.hubLabel')}>
                <Select
                  value={draft.hubId}
                  onValueChange={(value) => setDraft({ ...draft, hubId: value as typeof hubId })}
                >
                  <SelectTrigger aria-label={t('loyaltyStore.hubLabel')}>
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
              </FilterField>
              {/*
              Radix rather than `NativeSelect`, the one thing a real `<select>`
              can't do: the trigger shows just "Sell"/"Buy" while the open list
              spells out what each basis means. A native option's text is the same
              in both places, so the closed box had to carry "(list order)" —
              twelve characters of explanation sitting permanently in a filter row.
            */}
              <FilterField label={t('loyaltyStore.priceBasisLabel')}>
                <Select
                  value={draft.priceBasis}
                  onValueChange={(value) => setDraft({ ...draft, priceBasis: value as PriceBasis })}
                >
                  {/*
                  An `aria-label` on the trigger ends name computation, so nothing
                  inside it is ever announced — including the selection. The visible
                  text is deliberately short here, so the label carries the long form
                  and the current basis itself.
                */}
                  <SelectTrigger
                    aria-label={`${t('loyaltyStore.priceBasisLabel')}: ${t(
                      draft.priceBasis === 'buy'
                        ? 'loyaltyStore.priceBasisBuy'
                        : 'loyaltyStore.priceBasisSell'
                    )}`}
                  >
                    <SelectValue>
                      {t(
                        draft.priceBasis === 'buy'
                          ? 'loyaltyStore.priceBasisBuyShort'
                          : 'loyaltyStore.priceBasisSellShort'
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sell">{t('loyaltyStore.priceBasisSell')}</SelectItem>
                    <SelectItem value="buy">{t('loyaltyStore.priceBasisBuy')}</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label={t('loyaltyStore.lpBasisLabel')}>
                <Select
                  value={draft.lpBasis}
                  onValueChange={(value) => setDraft({ ...draft, lpBasis: value as LpBasis })}
                >
                  <SelectTrigger aria-label={t('loyaltyStore.lpBasisLabel')}>
                    <SelectValue>
                      {t(
                        draft.lpBasis === 'concord'
                          ? 'loyaltyStore.lpBasisConcord'
                          : 'loyaltyStore.lpBasisLp'
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lp">{t('loyaltyStore.lpBasisLp')}</SelectItem>
                    <SelectItem value="concord">{t('loyaltyStore.lpBasisConcord')}</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterChip
                label={t('loyaltyStore.affordableFilter')}
                selected={draft.affordableOnly}
                onToggle={() => setDraft({ ...draft, affordableOnly: !draft.affordableOnly })}
                count={affordableCount}
                size="md"
              />
              <FilterChip
                label={t('loyaltyStore.blueprintsFilter')}
                selected={draft.blueprintsOnly}
                onToggle={() => setDraft({ ...draft, blueprintsOnly: !draft.blueprintsOnly })}
                size="md"
              />
            </>
          )}
        </FilterBar>

        {offersFromCache && (
          <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
        )}

        {isDesktop ? (
          <div className="flex items-start gap-3">
            {list}
            {/* The mobile branch below opens the same content in a `Modal`,
              which announces itself on open — this split-panel layout just
              repaints in place, so it needs its own announcement (#1490). */}
            <p aria-live="polite" className="sr-only">
              {selectedRow &&
                t('loyaltyStore.selectedAnnouncement', { name: selectedRow.itemName })}
            </p>
            <Panel className="min-w-0 flex-1">{detail}</Panel>
          </div>
        ) : (
          <>
            {list}
            <Modal
              open={sheetOpen && selectedRow !== undefined}
              onClose={() => setSheetOpen(false)}
              title={selectedRow?.itemName ?? t('loyaltyStore.title')}
              placement="sheet"
            >
              {detail}
            </Modal>
          </>
        )}
      </div>
    </ItemActionsProvider>
  );
}
