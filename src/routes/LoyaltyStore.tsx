/**
 * One corporation's LP store (Wallet's Loyalty Points table links here by
 * `corporation_id`): every offer ranked by ISK/LP — profit divided by the LP
 * each offer costs, since LP (not ISK) is the resource a character can't
 * just make more of. A ranked list on the left, a full profit breakdown for
 * the selected offer on the right; on a phone the breakdown opens as a
 * bottom sheet instead of a second column. See
 * src/features/loyalty/useLoyaltyStoreOffers.ts for how the numbers are
 * assembled.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  Modal,
  NativeSelect,
  Panel,
  PageHeader,
  SearchInput,
  Spinner,
  StatChip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import { useMarketHub } from '@/features/market/hub';
import { TRADE_HUBS } from '@/market/hubs';
import { nameForType } from '@/features/industry/blueprintCatalog';
import { buildMarketParams } from '@/engine/market/urlState';
import { useLoyaltyStoreOffers } from '@/features/loyalty/useLoyaltyStoreOffers';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';

function iskPerLpTone(value: number | null): string {
  return value === null ? 'text-text-faint' : iskToneClass(value);
}

interface OfferDetailProps {
  row: LoyaltyOfferRow;
  catalog: BlueprintCatalog | null;
  hubName: string;
  playerLp: number;
  useOwnMaterials: boolean;
  onToggleUseOwnMaterials: () => void;
  onViewInMarket: (typeId: number) => void;
  onPlanInIndustry: (productTypeId: number) => void;
}

function OfferDetail({
  row,
  catalog,
  hubName,
  playerLp,
  useOwnMaterials,
  onToggleUseOwnMaterials,
  onViewInMarket,
  onPlanInIndustry,
}: OfferDetailProps) {
  const { t } = useTranslation();
  const marketTypeId = row.isBlueprint ? row.productTypeId : row.offer.type_id;
  const { profit } = row;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium text-text">
          {row.isBlueprint ? row.productName : row.itemName}
        </h3>
        {row.isBlueprint && <p className="text-xs text-text-faint">{row.itemName}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {marketTypeId !== null && (
          <Button variant="ghost" size="sm" onClick={() => onViewInMarket(marketTypeId)}>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Market size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('loyaltyStore.viewInMarket')}
            </span>
          </Button>
        )}
        {row.isBlueprint && row.productTypeId !== null && (
          <Button variant="ghost" size="sm" onClick={() => onPlanInIndustry(row.productTypeId!)}>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Industry size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('loyaltyStore.planInIndustry')}
            </span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <div className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
            {t('loyaltyStore.colIskPerLp')}
          </div>
          <div className={`text-2xl font-semibold tabular-nums ${iskPerLpTone(profit.iskPerLp)}`}>
            {profit.iskPerLp === null ? '—' : profit.iskPerLp.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
            {t('loyaltyStore.netProfit')}
          </div>
          <div className={`text-lg font-semibold tabular-nums ${iskPerLpTone(profit.profit)}`}>
            {profit.profit === null ? '—' : formatIsk(profit.profit)}
          </div>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between gap-4 text-text-dim">
          <dt>{t('loyaltyStore.sellPriceAt', { hub: hubName })}</dt>
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
        <p className="text-xs text-text-faint">
          {t('loyaltyStore.needMoreLp', {
            amount: (row.offer.lp_cost - playerLp).toLocaleString(),
          })}
        </p>
      )}
      {profit.profit === null && (
        <p className="text-xs text-warning">{t('loyaltyStore.unpriceable')}</p>
      )}

      {row.isBlueprint && row.build && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <FilterChip
            label={t('loyaltyStore.useOwnMaterials')}
            selected={useOwnMaterials}
            onToggle={onToggleUseOwnMaterials}
          />
          <p className="text-[0.6875rem] text-text-faint">
            {t('loyaltyStore.useOwnMaterialsHint')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-text-dim">
                  <th className="py-1 pr-2 font-semibold uppercase">
                    {t('loyaltyStore.materialColName')}
                  </th>
                  <th className="py-1 pr-2 text-right font-semibold uppercase">
                    {t('loyaltyStore.materialColNeeded')}
                  </th>
                  <th className="py-1 pr-2 text-right font-semibold uppercase">
                    {t('loyaltyStore.materialColOwned')}
                  </th>
                  <th className="py-1 text-right font-semibold uppercase">
                    {t('loyaltyStore.materialColBuyCost')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {row.build.materials.map((material) => (
                  <tr key={material.typeID}>
                    <td className="py-1 pr-2 text-text">
                      {catalog ? nameForType(catalog, material.typeID) : `#${material.typeID}`}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-text-dim">
                      {material.quantity.toLocaleString()}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-text-dim">
                      {material.ownedQuantity.toLocaleString()}
                    </td>
                    <td className="py-1 text-right tabular-nums text-text">
                      {formatIsk(material.lineCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function LoyaltyStore() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { corporationId: corporationIdParam } = useParams<{ corporationId: string }>();
  const corporationId = Number(corporationIdParam);
  const isDesktop = useIsDesktop();

  const hydrateHub = useMarketHub((s) => s.hydrate);
  const hubId = useMarketHub((s) => s.value);
  const setHubId = useMarketHub((s) => s.setValue);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

  const {
    corpName,
    offersFetchedAt,
    offersFromCache,
    rows,
    catalog,
    playerLp,
    hub,
    ready,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
  } = useLoyaltyStoreOffers(corporationId);

  const [search, setSearch] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [blueprintsOnly, setBlueprintsOnly] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (affordableOnly && !row.profit.affordableLp) return false;
      if (blueprintsOnly && !row.isBlueprint) return false;
      if (q && !row.itemName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, affordableOnly, blueprintsOnly]);

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
    setSelectedOfferId(row.offer.offer_id);
    if (!isDesktop) setSheetOpen(true);
  }

  function viewInMarket(typeId: number) {
    const params = buildMarketParams(typeId, { mode: 'hub', hubId: hub.id });
    navigate(`/market?${new URLSearchParams(params).toString()}`);
  }

  function planInIndustry(productTypeId: number) {
    navigate(`/industry?product=${productTypeId}`);
  }

  const columns: DataTableColumn<LoyaltyOfferRow>[] = [
    {
      id: 'item',
      header: t('loyaltyStore.colItem'),
      primary: true,
      sortValue: (row) => row.itemName,
      render: (row) => (
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-text">{row.itemName}</span>
            {row.isBlueprint && (
              <span className="rounded-xs border border-warning/40 px-1 text-[0.5625rem] font-bold tracking-wide text-warning uppercase">
                BP
              </span>
            )}
          </span>
          <span className="text-[0.6875rem] text-text-faint">
            {row.offer.lp_cost.toLocaleString()} LP + {formatIsk(row.offer.isk_cost)}
          </span>
        </span>
      ),
    },
    {
      id: 'profit',
      header: t('loyaltyStore.colProfit'),
      align: 'right',
      sortValue: (row) => row.profit.profit ?? undefined,
      cellClassName: (row) => iskPerLpTone(row.profit.profit),
      render: (row) => (row.profit.profit === null ? '—' : formatIsk(row.profit.profit)),
    },
    {
      id: 'iskPerLp',
      header: t('loyaltyStore.colIskPerLp'),
      align: 'right',
      sortValue: (row) => row.profit.iskPerLp ?? undefined,
      cellClassName: (row) => `font-semibold tabular-nums ${iskPerLpTone(row.profit.iskPerLp)}`,
      render: (row) => (row.profit.iskPerLp === null ? '—' : row.profit.iskPerLp.toFixed(1)),
    },
  ];

  const list = (
    <Panel
      title={t('loyaltyStore.title')}
      padded={false}
      className={isDesktop ? 'w-80 shrink-0' : undefined}
    >
      {!ready ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? t('loyaltyStore.emptyTitle') : t('loyaltyStore.noMatchTitle')}
          hint={rows.length === 0 ? t('loyaltyStore.emptyHint') : t('loyaltyStore.noMatchHint')}
        />
      ) : (
        <DataTable
          label={t('loyaltyStore.title')}
          columns={columns}
          rows={filteredRows}
          rowKey={(row) => row.offer.offer_id}
          density="compact"
          defaultSort={{ columnId: 'iskPerLp', direction: 'desc' }}
          onRowClick={selectRow}
          rowClassName={(row) =>
            row.offer.offer_id === selectedRow?.offer.offer_id ? 'bg-panel-2' : undefined
          }
        />
      )}
    </Panel>
  );

  const detail = selectedRow ? (
    <OfferDetail
      row={selectedRow}
      catalog={catalog}
      hubName={hub.name}
      playerLp={playerLp}
      useOwnMaterials={useOwnMaterialsFor.has(selectedRow.offer.offer_id)}
      onToggleUseOwnMaterials={() => toggleUseOwnMaterials(selectedRow.offer.offer_id)}
      onViewInMarket={viewInMarket}
      onPlanInIndustry={planInIndustry}
    />
  ) : (
    <p className="p-4 text-xs text-text-faint">{t('loyaltyStore.selectPrompt')}</p>
  );

  return (
    <div className="flex flex-col gap-3">
      <Link to="/wallet" className="inline-block text-xs text-accent hover:underline">
        {'←'} {t('loyaltyStore.back')}
      </Link>

      <PageHeader
        title={corpName ?? t('loyaltyStore.title')}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {offersFetchedAt && <DataAgeBadge date={offersFetchedAt} />}
            <StatChip
              label={t('loyaltyStore.yourLp')}
              value={playerLp.toLocaleString()}
              tone="accent"
            />
            <StatChip
              label={t('loyaltyStore.offersShown')}
              value={`${filteredRows.length} / ${rows.length}`}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          placeholder={t('loyaltyStore.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-40 flex-1"
        />
        <NativeSelect
          aria-label={t('loyaltyStore.hubLabel')}
          value={hubId}
          onChange={(e) => void setHubId(e.target.value as typeof hubId)}
          className="w-auto"
        >
          {TRADE_HUBS.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </NativeSelect>
        <FilterChip
          label={t('loyaltyStore.affordableFilter')}
          selected={affordableOnly}
          onToggle={() => setAffordableOnly((v) => !v)}
          count={affordableCount}
        />
        <FilterChip
          label={t('loyaltyStore.blueprintsFilter')}
          selected={blueprintsOnly}
          onToggle={() => setBlueprintsOnly((v) => !v)}
        />
      </div>

      {offersFromCache && (
        <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
      )}

      {isDesktop ? (
        <div className="flex items-start gap-3">
          {list}
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
  );
}
