/**
 * Loaders for the market catalogue snapshot (public/data/market/*.json).
 * Separate from loadSde.ts because these payloads are deliberately excluded
 * from the install precache (vite.config.ts globIgnores) — most installs
 * never open /market, so they should not pay ~1.2 MB for it up front
 * (CONTEXT.md round 10). Same fetch-once-and-memoize shape as loadSde.ts.
 */
import type {
  MarketGroupNode,
  MarketTypeEntry,
  SolarSystemEntry,
  SystemPositionData,
  JumpGraphData,
  NpcStationEntry,
  MarketRegionEntry,
  GlobalMarketEntry,
  AttributeDictionary,
  VariationData,
  LpCorporationEntry,
} from './marketTypes';
import { sdeDataUrl } from './sdeDataUrl';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(sdeDataUrl(import.meta.env.BASE_URL, `market/${file}`));
  if (!res.ok) throw new Error(`Failed to load market/${file}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function cached<T>(file: string): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= fetchJson<T>(file).catch((err) => {
      promise = null; // allow retry after failure
      throw err;
    });
    return promise;
  };
}

export const loadMarketGroups = cached<MarketGroupNode[]>('groups.json');
export const loadMarketTypes = cached<MarketTypeEntry[]>('types.json');
export const loadSolarSystems = cached<SolarSystemEntry[]>('systems.json');
/** Every system's map position in light years, for jump-drive range (issue #2862). */
export const loadSystemPositions = cached<SystemPositionData>('systemPositions.json');
export const loadNpcStations = cached<NpcStationEntry[]>('stations.json');
export const loadSolarSystemJumps = cached<JumpGraphData>('jumps.json');
export const loadMarketRegions = cached<MarketRegionEntry[]>('regions.json');
export const loadGlobalMarkets = cached<GlobalMarketEntry[]>('globalMarkets.json');
export const loadAttributeDictionary = cached<AttributeDictionary>('attributes.json');
export const loadVariations = cached<VariationData>('variations.json');
/** Every NPC corporation with an LP Store, for searching stores offline (issue #2320). */
export const loadLpCorporations = cached<LpCorporationEntry[]>('lpCorporations.json');
