import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

export const TREND_SOURCE_IDS = [
  'minerals',
  'ice',
  'ore',
  'compressedOre',
  'iceOre',
  'compressedIceOre',
  'moonOre',
  'compressedMoonOre',
  'plex',
] as const;
export type TrendSourceId = (typeof TREND_SOURCE_IDS)[number];

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
const ORES_GROUP = 54;
const EMPIRE_ORES_GROUP = 3849;
const ICE_ORES_GROUP = 1855;
const MOON_ORES_GROUP = 2395;
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

  const asItem = ({ typeId, name }: MarketTypeEntry): TrendSourceItem => ({ typeId, name });
  const compressedOf = (raw: TrendSourceItem[], pool: readonly MarketTypeEntry[]) => {
    const wanted = new Set(raw.map((item) => `Compressed ${item.name}`));
    return pool.filter((entry) => wanted.has(entry.name)).map(asItem);
  };

  const standardPool = groups
    .filter((g) => g.parentId === ORES_GROUP && g.id !== EMPIRE_ORES_GROUP)
    .flatMap((g) => types.filter((entry) => entry.marketGroupId === g.id && entry.name === g.name))
    .concat(types.filter((entry) => entry.marketGroupId === EMPIRE_ORES_GROUP));
  const standardRaw = standardPool
    .filter((entry) => !entry.name.startsWith('Compressed '))
    .map(asItem);
  const standardGroupIds = new Set([
    EMPIRE_ORES_GROUP,
    ...groups.filter((g) => g.parentId === ORES_GROUP).map((g) => g.id),
  ]);
  const standardTypes = types.filter((entry) => standardGroupIds.has(entry.marketGroupId));

  const baseGrades = (pool: readonly MarketTypeEntry[]): TrendSourceItem[] => {
    const plain = pool.filter(
      (entry) =>
        !/^(Batch )?Compressed /.test(entry.name) && !/\b(II|III|IV|0)-Grade$/.test(entry.name)
    );
    return plain
      .filter((e) => !plain.some((o) => o !== e && e.name.endsWith(` ${o.name}`)))
      .map(asItem);
  };
  const iceTypes = types.filter((entry) => entry.marketGroupId === ICE_ORES_GROUP);
  const moonGroupIds = new Set(
    groups.filter((g) => g.parentId === MOON_ORES_GROUP).map((g) => g.id)
  );
  const moonTypes = types.filter((entry) => moonGroupIds.has(entry.marketGroupId));
  const iceRaw = baseGrades(iceTypes);
  const moonRaw = baseGrades(moonTypes);

  const named = new Map(types.map((entry) => [entry.typeId, entry.name]));
  const plex = TREND_PLEX_IDS.flatMap((typeId) => {
    const name = named.get(typeId);
    return name === undefined ? [] : [{ typeId, name }];
  });

  return [
    { id: 'minerals', items: inGroup(MINERALS_GROUP) },
    { id: 'ice', items: inGroup(ICE_PRODUCTS_GROUP) },
    { id: 'ore', items: standardRaw.sort(byName) },
    { id: 'compressedOre', items: compressedOf(standardRaw, standardTypes).sort(byName) },
    { id: 'iceOre', items: iceRaw.sort(byName) },
    { id: 'compressedIceOre', items: compressedOf(iceRaw, iceTypes).sort(byName) },
    { id: 'moonOre', items: moonRaw.sort(byName) },
    { id: 'compressedMoonOre', items: compressedOf(moonRaw, moonTypes).sort(byName) },
    { id: 'plex', items: plex },
  ];
}

export interface TrendSearchHit extends TrendSourceItem {
  sourceId: TrendSourceId | 'quickbar';
}

export function searchTrendItems(
  lists: readonly { id: TrendSearchHit['sourceId']; items: readonly TrendSourceItem[] }[],
  query: string
): TrendSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const seen = new Set<number>();
  const starts: TrendSearchHit[] = [];
  const contains: TrendSearchHit[] = [];
  for (const list of lists) {
    for (const { typeId, name } of list.items) {
      if (seen.has(typeId)) continue;
      const at = name.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      seen.add(typeId);
      (at === 0 ? starts : contains).push({ typeId, name, sourceId: list.id });
    }
  }
  return [...starts, ...contains];
}
