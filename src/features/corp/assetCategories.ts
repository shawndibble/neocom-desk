import { loadMarketGroups } from '@/sde/loadMarketSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import type { MarketGroupNode } from '@/sde/marketTypes';

export interface AssetCategory {
  id: number;
  name: string;
}

export function marketGroupBranch(
  groups: ReadonlyMap<number, MarketGroupNode>,
  groupId: number
): { root: MarketGroupNode; child: MarketGroupNode | null } | null {
  let node = groups.get(groupId) ?? null;
  if (node === null) return null;
  let child: MarketGroupNode | null = null;
  for (let hops = 0; node.parentId !== null && hops < 32; hops += 1) {
    const parent = groups.get(node.parentId);
    if (!parent) break;
    child = node;
    node = parent;
  }
  return { root: node, child };
}

export function rootMarketGroup(
  groups: ReadonlyMap<number, MarketGroupNode>,
  groupId: number
): MarketGroupNode | null {
  return marketGroupBranch(groups, groupId)?.root ?? null;
}

export async function loadTypeCategories(
  typeIds: readonly number[]
): Promise<ReadonlyMap<number, AssetCategory>> {
  try {
    const [groupList, typesById] = await Promise.all([loadMarketGroups(), loadMarketTypesById()]);
    const groups = new Map(groupList.map((group) => [group.id, group]));
    const result = new Map<number, AssetCategory>();
    for (const typeId of typeIds) {
      const entry = typesById.get(typeId);
      if (!entry) continue;
      const root = rootMarketGroup(groups, entry.marketGroupId);
      if (root) result.set(typeId, { id: root.id, name: root.name });
    }
    return result;
  } catch {
    return new Map();
  }
}
