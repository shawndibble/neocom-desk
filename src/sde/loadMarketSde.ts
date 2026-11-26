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
import { fetchJsonWithIdleTimeout } from '@/lib/idleTimeout';

function fetchJson<T>(file: string): Promise<T> {
  return fetchJsonWithIdleTimeout<T>(
    sdeDataUrl(import.meta.env.BASE_URL, `market/${file}`),
    `market/${file}`
  );
}

function cached<T>(file: string): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= fetchJson<T>(file).catch((err) => {
      promise = null;
      throw err;
    });
    return promise;
  };
}

export const loadMarketGroups = cached<MarketGroupNode[]>('groups.json');
export const loadMarketTypes = cached<MarketTypeEntry[]>('types.json');
export const loadSolarSystems = cached<SolarSystemEntry[]>('systems.json');
export const loadSystemPositions = cached<SystemPositionData>('systemPositions.json');
export const loadNpcStations = cached<NpcStationEntry[]>('stations.json');
export const loadGatePositions = cached<Record<string, number[]>>('gates.json');
export const loadSolarSystemJumps = cached<JumpGraphData>('jumps.json');
export const loadMarketRegions = cached<MarketRegionEntry[]>('regions.json');
export const loadGlobalMarkets = cached<GlobalMarketEntry[]>('globalMarkets.json');
export const loadAttributeDictionary = cached<AttributeDictionary>('attributes.json');
export const loadVariations = cached<VariationData>('variations.json');
export const loadLpCorporations = cached<LpCorporationEntry[]>('lpCorporations.json');
