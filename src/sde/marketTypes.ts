export interface MarketGroupNode {
  id: number;
  name: string;
  parentId: number | null;
  hasTypes: boolean;
}

export interface MarketTypeEntry {
  typeId: number;
  name: string;
  marketGroupId: number;
  volume: number;
  packagedVolume?: number;
}

export function packagedVolumeOf(type: Pick<MarketTypeEntry, 'volume' | 'packagedVolume'>): number {
  return type.packagedVolume ?? type.volume;
}

export function knownPackagedVolumeOf(
  type: Pick<MarketTypeEntry, 'volume' | 'packagedVolume'> | undefined
): number | null {
  if (type === undefined) return null;
  const volume = packagedVolumeOf(type) as number | undefined;
  return typeof volume === 'number' && Number.isFinite(volume) ? volume : null;
}

export type SystemPositionData = number[];

export interface SolarSystemEntry {
  id: number;
  name: string;
  security: number;
  regionId: number;
}

export type JumpGraphData = Readonly<Record<string, readonly number[]>>;

export interface NpcStationEntry {
  id: number;
  name: string;
  systemId: number;
  typeId?: number;
  ownerCorporationId?: number;
  ownerFactionId?: number;
  reprocessingStationsTake?: number;
}

export interface LpCorporationEntry {
  id: number;
  name: string;
  factionId?: number;
}

export interface MarketRegionEntry {
  id: number;
  name: string;
}

export interface GlobalMarketEntry {
  typeId: number;
  regionId: number;
  regionName: string;
}

export interface AttributeDictionaryEntry {
  name: string;
  unit: string | null;
  category: string;
  unitId?: number;
}

export type AttributeDictionary = Readonly<Record<number, AttributeDictionaryEntry>>;

export interface VariationEntry {
  parentTypeId: number | null;
  metaGroupId: number;
}

export interface VariationData {
  types: Readonly<Record<number, VariationEntry>>;
  metaGroups: Readonly<Record<number, string>>;
}
