/**
 * Composes one corp's LP store into ranked, profit-annotated rows: the
 * offers list, the Build Plan blueprint catalog (to tell a blueprint offer
 * from a plain item), a market snapshot at the selected hub (reusing
 * `src/features/industry/marketData.ts`, the same loader a Build Plan
 * uses), the active character's trained skills and LP balance with this
 * corp, and their detected owned-material stock
 * (`useDetectedOwnedStock`, the same hook a Build Plan's materials table
 * uses) for the per-offer "use my own materials" toggle.
 */
import { useEffect, useMemo, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import { loadLoyaltyStoreOffers, loadCorporationName } from './store';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadMarketSnapshot, type MarketSnapshot } from '@/features/industry/marketData';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { loadTypeNames } from '@/features/character/typeNames';
import { useDetectedOwnedStock } from '@/features/industry/useDetectedOwnedStock';
import type { MaterialSourcingMap, SkillLevels } from '@/engine/industry/types';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { computeLoyaltyOfferRows, type LoyaltyOfferRow } from './offerRows';

export interface LoyaltyStoreResult {
  corpName: string | null;
  offersFetchedAt: Date | null;
  offersFromCache: boolean;
  rows: LoyaltyOfferRow[];
  /** For resolving a blueprint's material names in the detail panel. */
  catalog: BlueprintCatalog | null;
  playerLp: number;
  hub: TradeHub;
  hubHydrated: boolean;
  /** True once offers, the catalog and a market snapshot have all loaded at least once. */
  ready: boolean;
  useOwnMaterialsFor: ReadonlySet<number>;
  toggleUseOwnMaterials: (offerId: number) => void;
}

export function useLoyaltyStoreOffers(corporationId: number): LoyaltyStoreResult {
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const hubId = useMarketHub((s) => s.value);
  const hubHydrated = useMarketHub((s) => s.hydrated);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const [corpName, setCorpName] = useState<string | null>(null);
  const [offers, setOffers] = useState<LoyaltyStoreOffer[] | null>(null);
  const [offersFetchedAt, setOffersFetchedAt] = useState<Date | null>(null);
  const [offersFromCache, setOffersFromCache] = useState(false);
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [playerLp, setPlayerLp] = useState(0);
  const [skills, setSkills] = useState<SkillLevels>({});
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [itemNames, setItemNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [useOwnMaterialsFor, setUseOwnMaterialsFor] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [offersResult, name] = await Promise.all([
        loadLoyaltyStoreOffers(corporationId),
        loadCorporationName(corporationId),
      ]);
      if (cancelled) return;
      setOffers(offersResult?.data ?? []);
      setOffersFetchedAt(offersResult?.fetchedAt ?? null);
      setOffersFromCache(offersResult?.fromCache ?? false);
      setCorpName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [corporationId]);

  useEffect(() => {
    let cancelled = false;
    void loadBlueprintCatalog().then((cat) => {
      if (!cancelled) setCatalog(cat);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [lpResult, corrected] = await Promise.all([
        loadCharacterLoyaltyPoints(activeCharacterId),
        loadCorrectedSkills(activeCharacterId, Date.now(), { skipQueueWithoutScope: true }),
      ]);
      if (cancelled) return;
      const entry = lpResult.cached?.data.find((e) => e.corporation_id === corporationId);
      setPlayerLp(entry?.loyalty_points ?? 0);
      const map: SkillLevels = {};
      for (const [skillId, trained] of corrected.trained) map[skillId] = trained.level;
      setSkills(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, corporationId]);

  // typeIds worth pricing at the hub: every offer's own item, any
  // required_items turn-ins, and — for a catalog-known blueprint offer — its
  // product and its materials.
  const typeIds = useMemo(() => {
    if (!offers || !catalog) return [];
    const ids = new Set<number>();
    for (const offer of offers) {
      ids.add(offer.type_id);
      for (const req of offer.required_items) ids.add(req.type_id);
      const entry = catalog.byBlueprintTypeID.get(offer.type_id);
      if (entry) {
        if (entry.productTypeID !== null) ids.add(entry.productTypeID);
        for (const m of entry.blueprint.materials) ids.add(m.typeID);
      }
    }
    return [...ids];
  }, [offers, catalog]);

  const materialTypeIds = useMemo(() => {
    if (!offers || !catalog) return [];
    const ids = new Set<number>();
    for (const offer of offers) {
      const entry = catalog.byBlueprintTypeID.get(offer.type_id);
      if (entry) for (const m of entry.blueprint.materials) ids.add(m.typeID);
    }
    return [...ids];
  }, [offers, catalog]);

  // Every offer's own item name — resolved via `loadTypeNames` (SDE snapshot
  // first, then a batched ESI call for whatever it doesn't cover) rather than
  // `blueprintCatalog`'s `typesById`, which only carries types some blueprint
  // or skill references. LP stores hand out plenty that neither ever does
  // (implants, Mindlinks, SKINs) — see offerRows.ts's `itemNames`.
  const offerTypeIds = useMemo(() => (offers ?? []).map((offer) => offer.type_id), [offers]);

  useEffect(() => {
    if (offerTypeIds.length === 0) return;
    let cancelled = false;
    void loadTypeNames(offerTypeIds).then((names) => {
      if (!cancelled) setItemNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [offerTypeIds]);

  const { stock } = useDetectedOwnedStock(materialTypeIds);

  const materialSourcing = useMemo<MaterialSourcingMap | undefined>(() => {
    if (stock.size === 0) return undefined;
    const map: MaterialSourcingMap = {};
    // The required quantity varies per blueprint offer, so this only needs to
    // be an upper bound — buildVsBuy's own sourcing pass (sourcing.ts) clamps
    // to each build's actual requirement per material.
    for (const typeId of materialTypeIds) {
      const detected = stock.get(typeId);
      if (detected) map[typeId] = { ownedQuantity: detected.quantity };
    }
    return map;
  }, [stock, materialTypeIds]);

  useEffect(() => {
    if (!hubHydrated || typeIds.length === 0) return;
    let cancelled = false;
    void loadMarketSnapshot(hub, typeIds).then((snap) => {
      if (!cancelled) setSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
    // `hub` is a plain object recomputed every render from `hubId`; keying off
    // `hubId` (not `hub`) is what keeps this from refetching every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, hubHydrated, typeIds]);

  const rows = useMemo(() => {
    if (!offers || !catalog || !snapshot) return [];
    return computeLoyaltyOfferRows({
      offers,
      catalog,
      hubPrices: snapshot.hubPrices,
      adjustedPrices: snapshot.adjustedPrices,
      systemCostIndex: snapshot.systemCostIndex,
      skills,
      materialSourcing,
      itemNames,
      useOwnMaterialsFor,
      playerLp,
    });
  }, [
    offers,
    catalog,
    snapshot,
    skills,
    materialSourcing,
    itemNames,
    useOwnMaterialsFor,
    playerLp,
  ]);

  function toggleUseOwnMaterials(offerId: number): void {
    setUseOwnMaterialsFor((prev) => {
      const next = new Set(prev);
      if (next.has(offerId)) next.delete(offerId);
      else next.add(offerId);
      return next;
    });
  }

  return {
    corpName,
    offersFetchedAt,
    offersFromCache,
    rows,
    catalog,
    playerLp,
    hub,
    hubHydrated,
    ready: offers !== null && catalog !== null && snapshot !== null,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
  };
}
