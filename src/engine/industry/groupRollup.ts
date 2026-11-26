import { clamp } from '../math';
import { mergeCostLines } from './mergeCostLines';
import type { BuildResult, MaterialCostLine } from './types';

export interface BuildGroupMember {
  planId: string;
  planName: string;
  hubId: string;
  result: BuildResult;
  shoppingMaterials: readonly MaterialCostLine[];
  tableMaterials: readonly MaterialCostLine[];
}

export interface HubShoppingList {
  hubId: string;
  materials: MaterialCostLine[];
}

export interface BuildGroupRollup {
  shoppingMaterials: MaterialCostLine[];
  tableMaterials: MaterialCostLine[];
  materialCost: number;
  topLevelJobFees: number;
  totalCost: number;
  buyCost: number | null;
  profit: number | null;
  seconds: number;
  unpriceable: boolean;
  shoppingByHub: HubShoppingList[];
  hubIds: string[];
  singleHub: boolean;
}

export interface RollUpBuildGroupOptions {
  ownedStock?: ReadonlyMap<number, number>;
}

function applyOwnedLedger(line: MaterialCostLine, ledgerQuantity: number): MaterialCostLine {
  const ownedQuantity = clamp(ledgerQuantity, 0, line.quantity);
  const remainingQuantity = line.quantity - ownedQuantity;
  const priorRemaining = line.remainingQuantity;
  const lineCost =
    line.unitPrice !== null
      ? remainingQuantity * line.unitPrice
      : priorRemaining > 0
        ? (remainingQuantity / priorRemaining) * line.lineCost
        : 0;
  return {
    ...line,
    ownedQuantity,
    remainingQuantity,
    lineCost,
    unpriced: remainingQuantity > 0 && line.unpriced,
  };
}

function acquisitionTypeIds(members: readonly BuildGroupMember[]): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const member of members) {
    for (const m of member.tableMaterials) {
      if (m.acquisitionTier !== undefined) ids.add(m.typeID);
    }
  }
  return ids;
}

interface PooledBlueprint {
  typeID: number;
  quantity: number;
  remainingQuantity: number;
  ownedQuantity: number;
  unitPrice: number | null;
  lineCost: number;
  unpriced: boolean;
}

function poolBlueprints(members: readonly BuildGroupMember[]): {
  pooled: Map<number, PooledBlueprint>;
  costDelta: number;
} {
  interface Tier {
    needed: number;
    owned: number;
    copyRuns: number | null;
    copyPrice: number | null;
    memberCost: number;
    memberBought: number;
  }
  interface Blueprint {
    tiers: Map<string, Tier>;
    fixedBought: number;
    fixedCost: number;
    fixedUnpriced: boolean;
  }
  const byType = new Map<number, Blueprint>();
  for (const member of members) {
    for (const row of member.tableMaterials) {
      const tier = row.acquisitionTier;
      if (!tier) continue;
      let blueprint = byType.get(row.typeID);
      if (!blueprint) {
        blueprint = { tiers: new Map(), fixedBought: 0, fixedCost: 0, fixedUnpriced: false };
        byType.set(row.typeID, blueprint);
      }
      if (!tier.pool) {
        blueprint.fixedBought += row.remainingQuantity;
        blueprint.fixedCost += row.lineCost;
        blueprint.fixedUnpriced ||= row.unpriced;
        continue;
      }
      const key = `${tier.me}:${tier.te}`;
      const seen = blueprint.tiers.get(key) ?? {
        needed: 0,
        owned: 0,
        copyRuns: tier.pool.copyRuns,
        copyPrice: tier.pool.copyPrice,
        memberCost: 0,
        memberBought: 0,
      };
      seen.needed += tier.pool.neededRuns;
      seen.owned = Math.max(seen.owned, tier.pool.ownedRuns);
      seen.memberCost += row.lineCost;
      seen.memberBought += row.remainingQuantity;
      blueprint.tiers.set(key, seen);
    }
  }

  const pooled = new Map<number, PooledBlueprint>();
  let costDelta = 0;
  for (const [typeID, blueprint] of byType) {
    if (blueprint.tiers.size === 0) continue;
    let bought = blueprint.fixedBought;
    let cost = blueprint.fixedCost;
    let unpriced = blueprint.fixedUnpriced;
    let unitPrice: number | null = null;
    for (const tier of blueprint.tiers.values()) {
      const shortfall = Math.max(0, tier.needed - tier.owned);
      const topUp = tier.copyRuns !== null;
      const copies = !topUp
        ? tier.memberBought
        : shortfall === 0
          ? 0
          : Math.ceil(shortfall / tier.copyRuns!) || 1;
      const tierCost = topUp ? copies * (tier.copyPrice ?? 0) : tier.memberCost;
      bought += copies;
      cost += tierCost;
      unpriced ||= topUp && copies > 0 && tier.copyPrice === null;
      unitPrice ??= tier.copyPrice;
      costDelta += tierCost - tier.memberCost;
    }
    const base = { typeID, unitPrice };
    pooled.set(
      typeID,
      bought === 0
        ? { ...base, quantity: 1, remainingQuantity: 0, ownedQuantity: 1, lineCost: 0, unpriced }
        : {
            ...base,
            quantity: bought,
            remainingQuantity: bought,
            ownedQuantity: 0,
            lineCost: cost,
            unpriced,
          }
    );
  }
  return { pooled, costDelta };
}

function withPooledBlueprints(
  materials: readonly MaterialCostLine[],
  pooled: ReadonlyMap<number, PooledBlueprint>
): MaterialCostLine[] {
  return materials.map((m) => {
    const pool = pooled.get(m.typeID);
    if (!pool) return m;
    return {
      ...m,
      baseQuantity: pool.quantity,
      quantity: pool.quantity,
      ownedQuantity: pool.ownedQuantity,
      remainingQuantity: pool.remainingQuantity,
      unitPrice: pool.unitPrice,
      lineCost: pool.lineCost,
      unpriced: pool.unpriced,
    };
  });
}

function nettedAgainstLedger(
  materials: readonly MaterialCostLine[],
  ownedStock: ReadonlyMap<number, number> | undefined,
  skipTypeIds: ReadonlySet<number>
): MaterialCostLine[] {
  if (!ownedStock) return [...materials];
  return materials.map((m) =>
    skipTypeIds.has(m.typeID) ? m : applyOwnedLedger(m, ownedStock.get(m.typeID) ?? 0)
  );
}

function sumOrNull(
  members: readonly BuildGroupMember[],
  pick: (m: BuildGroupMember) => number | null
): number | null {
  let sum = 0;
  for (const member of members) {
    const value = pick(member);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

function mergeMaterials(
  members: readonly BuildGroupMember[],
  pick: (m: BuildGroupMember) => readonly MaterialCostLine[]
): MaterialCostLine[] {
  const merged = new Map<number, MaterialCostLine>();
  for (const member of members) {
    for (const material of pick(member)) {
      const existing = merged.get(material.typeID);
      merged.set(material.typeID, existing ? mergeCostLines(existing, material) : { ...material });
    }
  }
  return [...merged.values()];
}

function shoppingListsByHub(members: readonly BuildGroupMember[]): HubShoppingList[] {
  const byHub = new Map<string, BuildGroupMember[]>();
  for (const member of members) {
    const existing = byHub.get(member.hubId);
    if (existing) existing.push(member);
    else byHub.set(member.hubId, [member]);
  }
  return [...byHub].map(([hubId, hubMembers]) => ({
    hubId,
    materials: mergeMaterials(hubMembers, (m) => m.shoppingMaterials),
  }));
}

export function rollUpBuildGroup(
  members: readonly BuildGroupMember[],
  { ownedStock }: RollUpBuildGroupOptions = {}
): BuildGroupRollup {
  const { pooled: pooledBlueprints, costDelta: blueprintPoolDelta } = poolBlueprints(members);
  const rawShoppingMaterials = withPooledBlueprints(
    mergeMaterials(members, (m) => m.shoppingMaterials),
    pooledBlueprints
  );
  const rawTableMaterials = withPooledBlueprints(
    mergeMaterials(members, (m) => m.tableMaterials),
    pooledBlueprints
  );
  const acquisitionIds = acquisitionTypeIds(members);
  const tableMaterials = nettedAgainstLedger(rawTableMaterials, ownedStock, acquisitionIds);
  const shoppingMaterials = nettedAgainstLedger(rawShoppingMaterials, ownedStock, acquisitionIds);

  const shoppingByHub = shoppingListsByHub(members);
  const hubIds = shoppingByHub.map((block) => block.hubId);

  const buyCost = sumOrNull(members, (m) => m.result.buyCost);
  const summedProfit = sumOrNull(members, (m) => m.result.profit);

  const ownedSaving = rawShoppingMaterials.reduce(
    (sum, raw, i) => sum + (raw.lineCost - shoppingMaterials[i]!.lineCost),
    0
  );
  const materialCost =
    members.reduce((sum, m) => sum + m.result.materialCost, 0) - ownedSaving + blueprintPoolDelta;
  const topLevelJobFees = members.reduce((sum, m) => sum + m.result.jobFee.total, 0);

  const profit = summedProfit === null ? null : summedProfit + ownedSaving - blueprintPoolDelta;

  const productUnpriceable = members.some(
    (m) => m.result.unpriceable && m.result.unpricedMaterials.length === 0
  );
  const unpriceable = productUnpriceable || tableMaterials.some((m) => m.unpriced);

  return {
    shoppingMaterials,
    tableMaterials,
    materialCost,
    topLevelJobFees,
    totalCost: materialCost + topLevelJobFees,
    buyCost,
    profit,
    seconds: members.reduce((sum, m) => sum + m.result.seconds, 0),
    unpriceable,
    shoppingByHub,
    hubIds,
    singleHub: hubIds.length <= 1,
  };
}
