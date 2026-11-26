import type { PlanetType } from '@/esi/endpoints';
import type { ProductRigScope } from '@/engine/industry/rigScope';

export type CharacterAttribute =
  'charisma' | 'intelligence' | 'memory' | 'perception' | 'willpower';

export interface SkillPrereq {
  skillTypeID: number;
  level: number;
}

export interface SkillType {
  typeID: number;
  name: string;
  description: string;
  groupID: number;
  groupName: string;
  rank: number;
  primaryAttr: CharacterAttribute;
  secondaryAttr: CharacterAttribute;
  prereqs: SkillPrereq[];
  basePrice?: number;
  alphaMaxLevel?: number;
}

export type MasteryMap = Record<string, SkillPrereq[][]>;

export interface Certificate {
  id: number;
  name: string;
  description: string;
  groupId: number;
  groupName: string;
  levels: SkillPrereq[][];
}

export interface CertifiedPlan {
  id: number;
  name: string;
  description: string;
  careerPathId: number;
  factionId?: number;
  factionName?: string;
  entries: SkillPrereq[];
  milestones: SkillPrereq[];
}

export interface SkillAttributeModifier {
  ownerSkillTypeID: number;
  gatingSkillTypeID: number;
  perLevelValue: number;
}

export type SkillAttributeModifierMap = Record<string, SkillAttributeModifier[]>;

export interface BlueprintQuantity {
  typeID: number;
  quantity: number;
}

export interface BlueprintSkill {
  typeID: number;
  level: number;
}

export interface BlueprintType {
  name: string;
  time: number;
  materials: BlueprintQuantity[];
  products: BlueprintQuantity[];
  skills: BlueprintSkill[];
  activity: 'manufacturing' | 'reaction';
  maxProductionLimit?: number;
  rigScope?: ProductRigScope;
}

export type BlueprintMap = Record<string, BlueprintType>;

export interface InventionProduct {
  typeID: number;
  quantity: number;
  probability: number;
}

export interface InventionRecipe {
  time: number;
  materials: BlueprintQuantity[];
  products: InventionProduct[];
  skills: BlueprintSkill[];
}

export interface BlueprintCopyInvention {
  copyTime?: number;
  invention?: InventionRecipe;
}

export interface Decryptor {
  name: string;
  probabilityMultiplier: number;
  me: number;
  te: number;
  runs: number;
}

export interface InventionData {
  blueprints: Record<string, BlueprintCopyInvention>;
  decryptors: Record<string, Decryptor>;
}

export interface TypeInfo {
  name: string;
  groupID: number;
  volume: number;
  packagedVolume?: number;
}

export interface ReprocessingMaterial {
  typeID: number;
  quantity: number;
}

export interface ReprocessingType {
  portionSize: number;
  materials: ReprocessingMaterial[];
  specialisationSkillID?: number;
}

export type ReprocessingMap = Record<string, ReprocessingType>;

export type TypeMap = Record<string, TypeInfo>;

export type FittingSlotAssignment = 'high' | 'medium' | 'low' | 'rig' | 'subsystem' | 'drone';

export type FittingSlotMap = Record<string, FittingSlotAssignment>;

export interface MarketWideTreeEntry {
  blueprintTypeID: number;
  time: number;
  outputQuantity: number;
  marketGroupID: number | null;
  materials: BlueprintQuantity[];
}

export type MarketWideTreeMap = Record<string, MarketWideTreeEntry>;

export interface PiInput {
  typeID: number;
  quantity: number;
  name: string;
}

export type PiFactoryKind = 'basic' | 'advanced' | 'highTech';

export interface PiSchematic {
  schematicId: number;
  name: string;
  cycleTime: number;
  quantity: number;
  volume: number;
  facility: PiFactoryKind;
  planetTypes: PlanetType[];
  inputs: PiInput[];
}

export interface PiRawResource {
  typeID: number;
  name: string;
  volume: number;
  planetTypes: PlanetType[];
}

export type PiPinKind = 'extractorControlUnit' | PiFactoryKind | 'storage' | 'launchpad';

export interface PiPinSpec {
  cpu: number;
  powergrid: number;
  capacity: number;
}

export interface PiCommandCenterLevel {
  level: number;
  cpu: number;
  powergrid: number;
}

export type PiSystemPlanets = Record<string, Partial<Record<PlanetType, number>>>;

export interface PiLinkSpec {
  cpu: number;
  powergrid: number;
  cpuPerKm: number;
  powergridPerKm: number;
  cpuLevelModifier: number;
  powergridLevelModifier: number;
}

export interface PiInfrastructure {
  pins: Record<PiPinKind, PiPinSpec>;
  pinKindByTypeId: Record<string, PiPinKind>;
  commandCenterTypeIds: number[];
  extractorHead: { cpu: number; powergrid: number };
  link: PiLinkSpec;
  commandCenterUpgrades: PiCommandCenterLevel[];
}

export interface PiData {
  schematics: Record<string, PiSchematic>;
  raw: PiRawResource[];
  infrastructure: PiInfrastructure;
  planetTypeByTypeId: Record<string, PlanetType>;
}

export interface ShipTreeSkill {
  skillTypeID: number;
  level: number;
}

export interface ShipTreeTrait {
  skillTypeID: number | null;
  bonus: number | null;
  unit: string;
  text: string;
}

export interface ShipTreeHullStats {
  highSlots: number;
  medSlots: number;
  lowSlots: number;
  rigSlots: number;
  rigSize: number;
  turretHardpoints: number;
  launcherHardpoints: number;
  cpu: number;
  powergrid: number;
  calibration: number;
  droneBay: number;
  droneBandwidth: number;
}

export interface ShipTreeShip {
  typeID: number;
  name: string;
  factionID: number;
  treeGroupID: number;
  techLevel: number;
  metaLevel: number;
  required: ShipTreeSkill[];
  traits: ShipTreeTrait[];
  stats: ShipTreeHullStats;
  description: string;
}

export interface ShipTreeClassSkill extends ShipTreeSkill {
  display: boolean;
}

export interface ShipTreeGroup {
  id: number;
  name: string;
  description: string;
  icon: string;
  prereqsByFaction: Record<string, ShipTreeClassSkill[]>;
}

export interface ShipTreeFaction {
  id: number;
  name: string;
  description: string;
}

export interface ShipTreeData {
  factions: ShipTreeFaction[];
  groups: Record<string, ShipTreeGroup>;
  ships: ShipTreeShip[];
}

export interface MutaplasmidAttributeRange {
  id: number;
  min: number;
  max: number;
  highIsGood: boolean;
}

export interface MutaplasmidEntry {
  result: number;
  bases: number[];
  attributes: MutaplasmidAttributeRange[];
}

export interface MutaplasmidData {
  attributeNames: Record<string, string>;
  mutaplasmids: Record<string, MutaplasmidEntry>;
  abyssalTypeIds: number[];
}

export type AgentRow = [number, string, number, number, number, number, 0 | 1];

export interface AgentsFile {
  divisions: Record<string, string>;
  agents: AgentRow[];
}

export interface NpcCorporationEntry {
  id: number;
  name: string;
  ticker: string;
  factionId?: number;
  hqStationId?: number;
  taxRate?: number;
}

export interface NpcCorporationsFile {
  factions: { id: number; name: string }[];
  corporations: NpcCorporationEntry[];
}

export interface MilitaryCampaignEntry {
  id: string;
  title: string;
  factionId: number | null;
  targetProgress: number;
}

export interface CampaignRewardRate {
  amount: number;
  interval: number;
}

export interface CampaignObjectiveEntry {
  id: string;
  campaignId: string;
  title: string;
  method: string;
  targetProgress: number;
  maxPerParticipant?: number;
  isk?: CampaignRewardRate;
  lp?: CampaignRewardRate & { corporationId: number };
  turnIn?: {
    typeId: number;
    traderTypeId: number;
    traderName: string;
    systemId: number | null;
  };
}

export interface MilitaryCampaignsFile {
  traderSystemSource: string;
  campaigns: MilitaryCampaignEntry[];
  objectives: CampaignObjectiveEntry[];
}
