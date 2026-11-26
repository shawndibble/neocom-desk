import type {
  AgentsFile,
  BlueprintMap,
  Certificate,
  CertifiedPlan,
  FittingSlotMap,
  InventionData,
  MarketWideTreeMap,
  MasteryMap,
  MilitaryCampaignsFile,
  MutaplasmidData,
  NpcCorporationsFile,
  PiData,
  PiSystemPlanets,
  ReprocessingMap,
  SkillAttributeModifierMap,
  ShipTreeData,
  SkillType,
  TypeMap,
} from './types';
import { sdeDataUrl } from './sdeDataUrl';
import { fetchJsonWithIdleTimeout } from '@/lib/idleTimeout';
import { memoizeAsync } from '@/lib/memoizeAsync';

function fetchJson<T>(file: string): Promise<T> {
  return fetchJsonWithIdleTimeout<T>(sdeDataUrl(import.meta.env.BASE_URL, file), file);
}

function cached<T>(file: string): () => Promise<T> {
  return memoizeAsync(() => fetchJson<T>(file));
}

export const loadSkills = cached<SkillType[]>('skills.json');
export const loadMasteries = cached<MasteryMap>('masteries.json');
export const loadCertifiedPlans = cached<CertifiedPlan[]>('certifiedPlans.json');
export const loadCertificates = cached<Certificate[]>('certificates.json');
export const loadSkillAttributeModifiers = cached<SkillAttributeModifierMap>(
  'skillAttributeModifiers.json'
);
export const loadBlueprints = cached<BlueprintMap>('blueprints.json');
export const loadInvention = cached<InventionData>('invention.json');
export const loadTypes = cached<TypeMap>('types.json');
export async function typeName(typeId: number): Promise<string> {
  const types = await loadTypes();
  return types[String(typeId)]?.name ?? `Type ${typeId}`;
}
export const loadGroupCategories = cached<Record<string, number>>('groupCategories.json');
export const loadPi = cached<PiData>('pi.json');
export const loadReprocessing = cached<ReprocessingMap>('reprocessing.json');
export const loadPiPlanetRadius = cached<Record<string, number>>('pi-planet-radius.json');
export const loadPiSystemPlanets = cached<PiSystemPlanets>('pi-system-planets.json');
export const loadMoonOreTypeIds = cached<number[]>('moonOreTypes.json');
export const loadOreAndIceTypeIds = cached<number[]>('oreAndIceTypeIds.json');
export const loadGasCloudTypeIds = cached<number[]>('gasCloudTypeIds.json');
export const loadCompressedOreTypeIds = cached<Record<string, number>>('compressedOreTypeIds.json');
export const loadCompressedGasTypeIds = cached<Record<string, number>>('compressedGasTypeIds.json');
export const loadMarketWideTrees = cached<MarketWideTreeMap>('marketWideTrees.json');
export const loadFittingSlots = cached<FittingSlotMap>('fittingSlots.json');
export const loadMutaplasmids = cached<MutaplasmidData>('mutaplasmids.json');

export const loadTypeEffects = cached<Record<string, number[]>>('typeEffects.json');

export const loadSkillItemUnlocks = cached<SkillItemUnlockIndex>('skillItemUnlocks.json');

export type SkillItemUnlockIndex = Readonly<Record<string, readonly (readonly [number, number])[]>>;

export const loadShipTree = cached<ShipTreeData>('shipTree.json');

export const loadGameTypeNames = cached<string[]>('typeNames.json');

export const loadWormholeMass = cached<Record<string, [number, number]>>('wormholeMass.json');
export const loadCharacterTitles = cached<Record<string, string>>('characterTitles.json');
export const loadAgentsFile = cached<AgentsFile>('agents.json');
export const loadNpcCorporationsFile = cached<NpcCorporationsFile>('npcCorporations.json');
export const loadMilitaryCampaigns = cached<MilitaryCampaignsFile>('militaryCampaigns.json');
export const loadShipMass =
  cached<Record<string, [string, number, number, [number, number, number]?]>>('shipMass.json');
export const loadShipFlight = cached<Record<string, [number, number, number]>>('shipFlight.json');
