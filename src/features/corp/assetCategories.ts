/**
 * The Group column and Category filter of the corp assets ledger (issue
 * #4671): each type's top-level market group ("Ships", "Ship Equipment",
 * "Blueprints & Reactions"). The slim SDE carries category ids but no
 * category names, and the market catalogue carries named groups, so the
 * catalogue is what can be shown. A type outside it (an unlisted item) has no
 * category.
 *
 * Best-effort like the volume read: a catalogue that will not load leaves the
 * column and filter empty rather than failing the page.
 */
import { loadMarketGroups } from '@/sde/loadMarketSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import type { MarketGroupNode } from '@/sde/marketTypes';

export interface AssetCategory {
  id: number;
  name: string;
}

/** The root of a market group's ancestry; the group itself when it has no parent. */
export function rootMarketGroup(
  groups: ReadonlyMap<number, MarketGroupNode>,
  groupId: number
): MarketGroupNode | null {
  let node = groups.get(groupId) ?? null;
  // Bounded: a malformed catalogue with a parent cycle must not hang the page.
  for (let hops = 0; node !== null && node.parentId !== null && hops < 32; hops += 1) {
    const parent = groups.get(node.parentId);
    if (!parent) break;
    node = parent;
  }
  return node;
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
