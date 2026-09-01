// Shapes of the market catalogue JSON emitted by scripts/build-sde.mjs into
// public/data/market/ — kept out of the install precache (vite.config.ts
// globIgnores) and fetched lazily on first visit to /market, since most
// installs never open it (CONTEXT.md round 10).

/** One entry in public/data/market/groups.json — a node in invMarketGroups. */
export interface MarketGroupNode {
  id: number;
  name: string;
  parentId: number | null;
  /** Only groups with hasTypes hold items directly; the rest are branches. */
  hasTypes: boolean;
}

/** One entry in public/data/market/types.json — a published, market-grouped type. */
export interface MarketTypeEntry {
  typeId: number;
  name: string;
  marketGroupId: number;
}

/** One entry in public/data/market/systems.json. */
export interface SolarSystemEntry {
  id: number;
  name: string;
  security: number;
  regionId: number;
}

/** One entry in public/data/market/stations.json — an NPC station. */
export interface NpcStationEntry {
  id: number;
  name: string;
  systemId: number;
}

/** One entry in public/data/market/regions.json — a region probed to actually carry orders. */
export interface MarketRegionEntry {
  id: number;
  name: string;
}

/**
 * One entry in public/data/market/globalMarkets.json — a type that trades in
 * a Global Market Region (CONTEXT.md round 12) instead of the normal
 * regional books, e.g. PLEX in GPMR-01. Read live at build time, not
 * hardcoded — see scripts/build-sde.mjs.
 */
export interface GlobalMarketEntry {
  typeId: number;
  regionId: number;
  regionName: string;
}

/**
 * One entry in public/data/market/attributes.json — turns a dogma
 * attribute_id from Item Detail's live ESI read into a display name, unit
 * and category (CONTEXT.md round 6). Published attributes only; an id
 * absent here has no display name and is skipped rather than shown raw.
 */
export interface AttributeDictionaryEntry {
  name: string;
  unit: string | null;
  category: string;
}

export type AttributeDictionary = Readonly<Record<number, AttributeDictionaryEntry>>;
