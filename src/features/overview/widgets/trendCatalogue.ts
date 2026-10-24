/**
 * What a Market Trend widget can be pointed at besides the Quickbar, read from
 * the market catalogue: the minerals, the ice products, one raw ore per ore
 * (its grades and compressed forms are separate types that trade alike), and
 * PLEX with the skill injectors. Pure: the dialog hands in the catalogue.
 */
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

export type TrendSourceId = 'minerals' | 'ice' | 'ore' | 'plex';

export interface TrendSourceItem {
  typeId: number;
  name: string;
}

export interface TrendSource {
  id: TrendSourceId;
  items: TrendSourceItem[];
}

const MINERALS_GROUP = 1857;
const ICE_PRODUCTS_GROUP = 1033;
/** The Standard Ores branch of the market tree: each child group is one ore. */
const ORES_GROUP = 54;
/** PLEX, then the Large and Small Skill Injectors. */
export const TREND_PLEX_IDS: readonly number[] = [44992, 40520, 45635];

const byName = (a: TrendSourceItem, b: TrendSourceItem) => a.name.localeCompare(b.name);

export function trendCatalogue(
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[]
): TrendSource[] {
  const inGroup = (id: number): TrendSourceItem[] =>
    types
      .filter((entry) => entry.marketGroupId === id)
      .map(({ typeId, name }) => ({ typeId, name }))
      .sort(byName);

  const oreGroups = groups.filter((g) => g.parentId === ORES_GROUP);
  const ore = oreGroups.flatMap((g) =>
    types
      .filter((entry) => entry.marketGroupId === g.id && entry.name === g.name)
      .map(({ typeId, name }) => ({ typeId, name }))
  );
  const named = new Map(types.map((entry) => [entry.typeId, entry.name]));
  const plex = TREND_PLEX_IDS.flatMap((typeId) => {
    const name = named.get(typeId);
    return name === undefined ? [] : [{ typeId, name }];
  });

  return [
    { id: 'minerals', items: inGroup(MINERALS_GROUP) },
    { id: 'ice', items: inGroup(ICE_PRODUCTS_GROUP) },
    { id: 'ore', items: ore.sort(byName) },
    { id: 'plex', items: plex },
  ];
}
