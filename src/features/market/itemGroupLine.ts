/**
 * Item Detail's subtitle: what kind of item this is, by its **Group** (the
 * inventory taxonomy: "Heavy Assault Cruiser"), never its **Market Group**
 * (GLOSSARY.md), plus a ship's faction ("Amarr Empire") off the Ship Tree.
 *
 * The groupID is local (`types.json`); the Group's name is the cached
 * `GET /universe/groups/{id}` read `groupNames.ts` already makes for
 * Group-valued attributes. Null, never a rejection, when either is missing:
 * the subtitle is context, so the modal just goes without it.
 */
import { SHIP_CATEGORY_ID } from '@/sde/categories';
import { loadGroupCategories, loadShipTree, loadTypes } from '@/sde/loadSde';
import { loadGroupNames } from './groupNames';

export interface ItemGroupLine {
  group: string;
  /** A ship's faction; null for anything else, or a hull the Ship Tree doesn't carry. */
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
