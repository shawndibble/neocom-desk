import { SHIP_CATEGORY_ID } from '@/sde/categories';
import { loadGroupCategories, loadShipTree, loadTypes } from '@/sde/loadSde';
import { loadGroupNames } from './groupNames';

export interface ItemGroupLine {
  group: string;
  faction: string | null;
}

export async function loadItemGroupLine(typeId: number): Promise<ItemGroupLine | null> {
  try {
    const types = await loadTypes();
    const groupId = types[String(typeId)]?.groupID;
    if (groupId === undefined) return null;
    const [names, categories] = await Promise.all([
      loadGroupNames([groupId]),
      loadGroupCategories().catch(() => ({}) as Record<string, number>),
    ]);
    const group = names.get(groupId);
    if (!group) return null;
    if (categories[String(groupId)] !== SHIP_CATEGORY_ID) return { group, faction: null };
    const tree = await loadShipTree().catch(() => null);
    const ship = tree?.ships.find((candidate) => candidate.typeID === typeId);
    const faction = ship
      ? (tree?.factions.find((candidate) => candidate.id === ship.factionID)?.name ?? null)
      : null;
    return { group, faction };
  } catch {
    return null;
  }
}
