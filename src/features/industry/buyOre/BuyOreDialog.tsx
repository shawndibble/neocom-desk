/**
 * "Buy ore instead": a plan's mineral shortfall as compressed ore bought at the
 * plan's hub and refined, against buying the minerals. The refining facility is
 * stated, and shares the synced structure rate with the Assets ore dialog.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  Button,
  DataTable,
  IskAmount,
  Modal,
  SegmentedControl,
  type DataTableColumn,
} from '@/components/ui';
import { DataGate } from '@/components/DataGate';
import { loadCompressedOreTypeIds, loadReprocessing, loadTypes } from '@/sde/loadSde';
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { reprocessingTaxOn } from '@/engine/industry/refiningSetup';
import { RefiningSetupChips } from '@/features/refining/RefiningSetupChips';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import { NO_CHARACTER_MODIFIERS, refiningEfficiency } from '@/engine/industry/characterModifiers';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import {
  compareOreRoute,
  oreBuyListText,
  planOreBuy,
  type BuyableOre,
  type OreOrdering,
  type OrePurchase,
} from '@/engine/industry/oreBuyPlan';
import { loadDepthPrices } from '../depthPriceLoader';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import { formatVolume } from '../format';

interface OreCandidate {
  typeId: number;
  portionSize: number;
  materials: { typeId: number; quantity: number }[];
  specialisationSkillId: number | undefined;
  unitPrice: number | null;
  unitVolume: number;
}

interface BuyOreData {
  candidates: OreCandidate[];
  modifiers: CharacterModifiers;
  mineralBuyPrices: Record<number, number>;
  names: ReadonlyMap<number, string>;
}

const TABLE_TITLE_TEXT = `border-b border-line bg-panel-2 px-2.5 py-1.5 ${eyebrowClassName}`;

export function BuyOreDialog({
  open,
  onClose,
  hub,
  needs,
  mineralsTotal,
}: {
  open: boolean;
  onClose: () => void;
  hub: TradeHub;
  /** The plan's mineral shortfall (units to buy per mineral type id). */
  needs: Readonly<Record<number, number>>;
  /** What buying those minerals costs as the plan prices them; null when unpriced. */
  mineralsTotal: number | null;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { setup: refiningSetup } = useRefiningSetup();
  const [ordering, setOrdering] = useState<OreOrdering>('cost');
  // Keyed on the inputs they were built for, so a changed hub or shortfall never
  // reads the previous load's prices while the new one is in flight.
  const [loaded, setLoaded] = useState<{ key: string; data: BuyOreData } | null>(null);
  const [walked, setWalked] = useState<{
    key: string;
    depth: ReadonlyMap<number, DepthPrice> | 'failed';
  } | null>(null);
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const { failed: loadFailed, attempt, fail, clear, retry } = useRetryableLoad();

  const needsKey = JSON.stringify(Object.entries(needs).sort());
  const inputKey = `${hub.id}|${needsKey}`;
  const data = loaded?.key === inputKey ? loaded.data : null;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    clear();
    void (async () => {
      const wanted = new Set(Object.keys(needs).map(Number));
      const [reprocessing, compressedByRaw, types] = await Promise.all([
        loadReprocessing(),
        loadCompressedOreTypeIds(),
        loadTypes(),
      ]);
      const modifiers =
        activeCharacterId === null
          ? NO_CHARACTER_MODIFIERS
          : await loadCharacterModifiers(activeCharacterId, Date.now());
      const candidates: OreCandidate[] = [];
      for (const compressedId of new Set(Object.values(compressedByRaw))) {
        const entry = reprocessing[String(compressedId)];
        if (!entry || !entry.materials.some((m) => wanted.has(m.typeID))) continue;
        candidates.push({
          typeId: compressedId,
          portionSize: entry.portionSize,
          materials: entry.materials.map((m) => ({ typeId: m.typeID, quantity: m.quantity })),
          specialisationSkillId: entry.specialisationSkillID,
          unitPrice: null,
          unitVolume: types[String(compressedId)]?.volume ?? 0,
        });
      }
      // Every mineral an ore refines into, so leftover byproducts are priced too.
      const ids = [
        ...new Set([
          ...wanted,
          ...candidates.flatMap((c) => [c.typeId, ...c.materials.map((m) => m.typeId)]),
        ]),
      ];
      const [prices, names] = await Promise.all([getHubPrices(hub, ids), loadTypeNames(ids)]);
      for (const c of candidates) {
        const price = prices.get(c.typeId)?.sellMin;
        c.unitPrice = price && price > 0 ? price : null;
      }
      const mineralBuyPrices: Record<number, number> = {};
      for (const id of ids) {
        const price = prices.get(id)?.buyMax;
        if (price && price > 0) mineralBuyPrices[id] = price;
      }
      if (!cancelled)
        setLoaded({ key: inputKey, data: { candidates, modifiers, mineralBuyPrices, names } });
    })().catch(() => {
      if (!cancelled) fail();
    });
    return () => {
      cancelled = true;
    };
    // `needsKey` stands for `needs`: a new object with the same content must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsKey, hub, activeCharacterId, attempt, fail, clear]);

  const rate = refiningSetup.stationRate;
  const ores: BuyableOre[] = useMemo(
    () =>
      data
        ? data.candidates.map((c) => ({
            typeId: c.typeId,
            portionSize: c.portionSize,
            materials: c.materials,
            efficiency: refiningEfficiency(data.modifiers, c.specialisationSkillId, rate),
            unitPrice: c.unitPrice,
            unitVolume: c.unitVolume,
          }))
        : [],
    [data, rate]
  );
  const route = useMemo(
    () =>
      data ? planOreBuy({ needs, ores, ordering, mineralPrices: data.mineralBuyPrices }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ores, ordering, needsKey]
  );

  // The route's units, walked through each ore's order book at the hub, so
  // the total is what buying that many costs rather than the lowest sell.
  const purchaseKey = route ? route.purchases.map((p) => `${p.typeId}:${p.units}`).join(',') : '';
  useEffect(() => {
    if (!route || route.purchases.length === 0) return;
    let cancelled = false;
    const key = `${inputKey}|${purchaseKey}`;
    const wanted = new Map(route.purchases.map((p) => [p.typeId, p.units]));
    void loadDepthPrices(hub, wanted)
      .then((depth) => {
        if (!cancelled) setWalked({ key, depth });
      })
      .catch(() => {
        if (!cancelled) setWalked({ key, depth: 'failed' });
      });
    return () => {
      cancelled = true;
    };
    // `purchaseKey` stands for `route.purchases`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, purchaseKey, inputKey]);

  const depth =
    walked?.key === `${inputKey}|${purchaseKey}` && walked.depth !== 'failed' ? walked.depth : null;
  // A failed walk falls back to the lowest sell, as the plan's own prices do.
  const walkSettled =
    !route || route.purchases.length === 0 || walked?.key === `${inputKey}|${purchaseKey}`;
  const underfilled =
    !!route && route.purchases.some((p) => depth?.get(p.typeId)?.covered === false);
  const unitCost = useCallback(
    (p: OrePurchase) => {
      const w = depth?.get(p.typeId);
      return w && w.need === p.units ? w.avg : p.units > 0 ? p.cost / p.units : 0;
    },
    [depth]
  );
  // The facility's fee on the minerals the route refines, paid on top of the ore itself.
  const refiningFee =
    route && data
      ? reprocessingTaxOn(route.refined, data.mineralBuyPrices, refiningSetup.taxRate)
      : 0;
  const oreCost = route
    ? route.purchases.reduce((s, p) => s + unitCost(p) * p.units, 0) + refiningFee
    : 0;
  const comparison =
    route && data && walkSettled && mineralsTotal !== null
      ? compareOreRoute({
          route,
          mineralsTotal,
          mineralBuyPrices: data.mineralBuyPrices,
          oreCost,
        })
      : null;

  // Minerals cheaper: no ore list to offer.
  const recommendOre = !!comparison?.recommendOre && !underfilled;
  const showRoute = !comparison || recommendOre;
  const name = (id: number) => data?.names.get(id) ?? `#${id}`;
  const efficiencyPct = fixed1(rate * 100);

  const columns: DataTableColumn<OrePurchase>[] = [
    {
      id: 'ore',
      header: t('industry.buyOre.oreColumn'),
      stickyStart: true,
      render: (p) => name(p.typeId),
      sortValue: (p) => name(p.typeId),
    },
    {
      id: 'units',
      header: t('industry.buyOre.unitsColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (p) => formatCount(p.units),
      sortValue: (p) => p.units,
    },
    {
      id: 'price',
      header: t('industry.buyOre.priceColumn'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (p) => <IskAmount value={unitCost(p)} decimals={2} />,
      sortValue: (p) => unitCost(p),
    },
    {
      id: 'minerals',
      header: t('industry.buyOre.mineralsColumn'),
      render: (p) =>
        Object.entries(p.outputs)
          .map(([id, q]) => `${formatCount(q)} ${name(Number(id))}`)
          .join(', '),
    },
  ];

  async function copyList() {
    if (!route) return;
    try {
      await writeToClipboard(oreBuyListText(route.purchases, name));
      flash('copied');
    } catch {
      flash('failed');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={isPhone ? 'sheet-full' : 'wide'}
      title={t('industry.buyOre.title')}
    >
      <div className="space-y-3 text-sm">
        <DataGate
          status={data === null && loadFailed ? 'failed' : 'ok'}
          title={t('industry.buyOre.loadFailed')}
          onRetry={retry}
        >
          {data === null || route === null ? (
            <p className="text-text-dim">{t('industry.buyOre.loading')}</p>
          ) : (
            <>
              <SegmentedControl<OreOrdering>
                label={t('industry.buyOre.ordering')}
                value={ordering}
                onChange={setOrdering}
                options={[
                  { value: 'cost', label: t('industry.buyOre.cheapest') },
                  { value: 'volume', label: t('industry.buyOre.lightest') },
                ]}
              />
              {route.uncovered.length > 0 && (
                <p className="text-warning">
                  {t('industry.buyOre.uncovered', {
                    minerals: route.uncovered.map(name).join(', '),
                  })}
                </p>
              )}
              {route.purchases.length === 0 ? (
                <p className="text-text-dim">{t('industry.buyOre.noRoute')}</p>
              ) : !showRoute ? null : (
                <div className="overflow-hidden rounded-xs border border-line">
                  <p className={TABLE_TITLE_TEXT}>{t('industry.buyOre.routeTitle')}</p>
                  <div className="overflow-x-auto">
                    <DataTable
                      columns={columns}
                      rows={route.purchases}
                      rowKey={(p) => p.typeId}
                      label={t('industry.buyOre.routeTitle')}
                      responsive="table"
                    />
                  </div>
                </div>
              )}
              {comparison && (
                <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2.5">
                  <p className="flex justify-between gap-2">
                    <span>{t('industry.buyOre.oreRoute')}</span>
                    <IskAmount value={comparison.oreNet} decimals={0} />
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>{t('industry.buyOre.buyMinerals')}</span>
                    <IskAmount value={comparison.mineralsTotal} decimals={0} />
                  </p>
                  <p className="font-semibold">
                    {recommendOre
                      ? t('industry.buyOre.saves', {
                          amount: formatCount(Math.round(comparison.saving)),
                        })
                      : underfilled
                        ? t('industry.buyOre.underfilled')
                        : t('industry.buyOre.buyMineralsCheaper')}
                  </p>
                </div>
              )}
              {!walkSettled && <p className="text-text-dim">{t('industry.buyOre.pricingDepth')}</p>}
              {mineralsTotal === null && (
                <p className="text-warning">{t('industry.buyOre.mineralsUnpriced')}</p>
              )}
              {route.purchases.length > 0 && (
                <p className="text-xs text-text-dim">
                  {t('industry.buyOre.totals', {
                    cost: formatCount(Math.round(oreCost)),
                    volume: formatVolume(route.volume),
                  })}
                </p>
              )}
              {Object.keys(route.leftovers).length > 0 && (
                <p className="text-xs text-text-dim">
                  {t('industry.buyOre.leftovers', {
                    minerals: Object.entries(route.leftovers)
                      .map(([id, q]) => `${formatCount(q)} ${name(Number(id))}`)
                      .join(', '),
                    value: comparison ? formatCount(Math.round(comparison.leftoverValue)) : '0',
                  })}
                </p>
              )}
              {comparison && comparison.leftoverUnpriced.length > 0 && (
                <p className="text-xs text-warning">
                  {t('industry.buyOre.leftoverUnpriced', {
                    minerals: comparison.leftoverUnpriced.map(name).join(', '),
                  })}
                </p>
              )}
              {route.purchases.length > 0 && (
                <p className="text-xs text-text-dim">{t('industry.buyOre.wholePortions')}</p>
              )}
              <div className="space-y-1.5 text-[0.6875rem] leading-relaxed text-text-dim">
                <p>{t('industry.buyOre.pricingBasis', { hub: hub.name })}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{t('industry.buyOre.yieldAssumption', { rate: efficiencyPct })}</span>
                  <RefiningSetupChips />
                </div>
                <p>
                  {t(
                    ordering === 'cost'
                      ? 'industry.buyOre.cheapestFound'
                      : 'industry.buyOre.lightestFound'
                  )}
                </p>
              </div>
              {recommendOre && (
                <div className="flex items-center gap-2">
                  <Button variant="accent" onClick={() => void copyList()}>
                    {copied === 'copied'
                      ? t('industry.buyOre.copied')
                      : copied === 'failed'
                        ? t('industry.buyOre.copyFailed')
                        : t('industry.buyOre.copy')}
                  </Button>
                </div>
              )}
            </>
          )}
        </DataGate>
      </div>
    </Modal>
  );
}
