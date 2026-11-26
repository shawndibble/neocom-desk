import type { HeldStockCost } from '@/features/assets/stockCostBasis';
import { createContext, useContext } from 'react';
import type { AssetTreeNode, AssetTreeStation } from '@/engine/assetTree';
import { assetPathHref } from '@/engine/assetPath';
import type { CharacterAsset } from '@/esi/endpoints';
import type { ContractAskEstimate } from '@/engine/contracts/askEstimate';
import type { AbyssalAssetEstimates } from '@/features/abyssal/useAbyssalAssetEstimates';
import type { BuildPlanRecord } from '@/db';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';

export function assetHref(
  stationId: number | null,
  segments: readonly string[],
  query: string
): string {
  return assetPathHref(stationId, segments) + query;
}

export function queryLeavingSearch(query: string): string {
  const params = new URLSearchParams(query);
  for (const key of ['q', 'all', 'min']) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export interface AssetMatch {
  asset: CharacterAsset;
  name: string;
  gameName?: string;
}

export interface CharacterBadgeContext {
  activeCharacterId: number | null;
  idByItemId: ReadonlyMap<number, number>;
  nameById: ReadonlyMap<number, string>;
}

export function characterBadgeFor(itemId: number, ctx: CharacterBadgeContext): string | null {
  const ownerId = ctx.idByItemId.get(itemId);
  if (ownerId === undefined || ownerId === ctx.activeCharacterId) return null;
  return ctx.nameById.get(ownerId) ?? null;
}

export interface AssetItemActions {
  priceByTypeId: ReadonlyMap<number, number>;
  itemValueByItemId: ReadonlyMap<number, number>;
  abyssal: AbyssalAssetEstimates;
  askEstimateByTypeId: ReadonlyMap<number, ContractAskEstimate>;
  volumeByTypeId: ReadonlyMap<number, number>;
  materialPlanMap: ReadonlyMap<number, BuildPlanRecord> | null;
  onViewInIndustryAsMaterial: (typeId: number) => void;
  stockCostByTypeId: ReadonlyMap<number, HeldStockCost> | null;
  blueprintTypeIds: ReadonlySet<number> | null;
  turnInOfferFor: (typeId: number) => TurnInOfferDetail | null;
}

export const AssetItemActionsContext = createContext<AssetItemActions | null>(null);

export function useAssetItemActions(): AssetItemActions {
  const actions = useContext(AssetItemActionsContext);
  if (!actions) throw new Error('Asset row rendered outside its actions provider');
  return actions;
}

export type BrowseRow =
  | { kind: 'heading'; key: string; label: string; tone: 'default' | 'warning' }
  | { kind: 'location'; key: string; station: AssetTreeStation }
  | { kind: 'node'; key: string; node: AssetTreeNode }
  | { kind: 'match'; key: string; match: AssetMatch };

export function baseRowHeight(row: BrowseRow): number {
  switch (row.kind) {
    case 'heading':
      return 33;
    case 'location':
    case 'match':
      return 64;
    case 'node':
      return 48;
  }
}

export function isUnresolvedParent(
  station: AssetTreeStation,
  locationNames: ReadonlyMap<number, string>
): boolean {
  return station.locationType === 'item' && !locationNames.has(station.locationId);
}
