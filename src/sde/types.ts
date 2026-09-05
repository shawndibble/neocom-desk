// Shapes of the slim SDE JSON emitted by scripts/build-sde.mjs.

import type { PlanetType } from '@/esi/endpoints';

export type CharacterAttribute =
  'charisma' | 'intelligence' | 'memory' | 'perception' | 'willpower';

export interface SkillPrereq {
  skillTypeID: number;
  level: number;
}

/** One entry in public/data/skills.json (SkillType[]). */
export interface SkillType {
  typeID: number;
  name: string;
  description: string;
  groupID: number;
  groupName: string;
  /** skillTimeConstant (dogma attr 275), 1-16 */
  rank: number;
  primaryAttr: CharacterAttribute;
  secondaryAttr: CharacterAttribute;
  prereqs: SkillPrereq[];
}

export interface BlueprintQuantity {
  typeID: number;
  quantity: number;
}

export interface BlueprintSkill {
  typeID: number;
  level: number;
}

/** One value in public/data/blueprints.json (manufacturing activity only). */
export interface BlueprintType {
  name: string;
  /** base manufacturing time in seconds */
  time: number;
  materials: BlueprintQuantity[];
  products: BlueprintQuantity[];
  skills: BlueprintSkill[];
}

/** public/data/blueprints.json: blueprint typeID -> BlueprintType */
export type BlueprintMap = Record<string, BlueprintType>;

/** One value in public/data/types.json. */
export interface TypeInfo {
  name: string;
  groupID: number;
  /** m3, unpackaged */
  volume: number;
}

/** public/data/types.json: typeID -> TypeInfo */
export type TypeMap = Record<string, TypeInfo>;

/** One input line of a planetary schematic. */
export interface PiInput {
  typeID: number;
  quantity: number;
  /** Carried inline: most planetary commodities are referenced by no blueprint, so types.json has no entry for them. */
  name: string;
}

/**
 * Which planetary factory pin runs a schematic. Derived from the SDE's own
 * `planetSchematicsPinMap`, never from the schematic's tier: the two agree
 * today (basic makes P1, advanced makes P2 and P3, high-tech makes P4) but
 * that agreement is a fact about the current recipe set, not a rule, and the
 * mapping is in the dump so there is nothing to infer.
 */
export type PiFactoryKind = 'basic' | 'advanced' | 'highTech';

/** One planetary schematic, keyed in pi.json by the typeID it produces. */
export interface PiSchematic {
  schematicId: number;
  /** Schematic name, which is also the produced item's name. */
  name: string;
  /** Seconds one production cycle takes. */
  cycleTime: number;
  /** Units produced per cycle. */
  quantity: number;
  /** m3 of one unit, from invTypes.volume. */
  volume: number;
  /** The factory pin this schematic runs in — see `PiFactoryKind`. */
  facility: PiFactoryKind;
  /**
   * Planet types carrying a factory that can run this schematic, sorted
   * alphabetically. Same strings as `PiRawResource.planetTypes`. Almost every
   * schematic runs on all eight; the P4s do not, because the High-Tech
   * Production Plant exists on Barren and Temperate only.
   */
  planetTypes: PlanetType[];
  inputs: PiInput[];
}

/**
 * One P0 resource: extracted straight off a planet, so no schematic produces
 * it and no blueprint references it — which is why its name and volume ride
 * along here instead of being looked up in types.json.
 */
export interface PiRawResource {
  typeID: number;
  name: string;
  /** m3 of one unit, from invTypes.volume. */
  volume: number;
  /**
   * Planet types whose extractors yield it, sorted alphabetically. Same
   * strings ESI reports as `CharacterPlanet.planet_type`, so a colony matches
   * this list directly. Which planet types, never how much — per-planet
   * richness is scanner-only and out of scope.
   */
  planetTypes: PlanetType[];
}

/** Every kind of pin a colony's CPU/Powergrid budget pays for. */
export type PiPinKind = 'extractorControlUnit' | PiFactoryKind | 'storage' | 'launchpad';

/** What one pin costs a colony, and what it holds. */
export interface PiPinSpec {
  /** tf drawn from the colony's CPU budget (dogma `cpuLoad`, attribute 49). */
  cpu: number;
  /** MW drawn from the colony's Powergrid budget (dogma `powerLoad`, attribute 15). */
  powergrid: number;
  /** m3 the pin holds, from invTypes.capacity. Zero for pins that hold nothing. */
  capacity: number;
}

/** What a Command Center supplies at one of its own upgrade levels. */
export interface PiCommandCenterLevel {
  /**
   * The Command Center's own upgrade level, 0-5 — what ESI reports per colony
   * as `CharacterPlanet.upgrade_level`, not the pilot's Command Center
   * Upgrades skill. The skill caps how far a colony may be upgraded; each
   * level is then bought per colony with ISK.
   */
  level: number;
  /** tf of CPU the colony's whole pin set is budgeted against. */
  cpu: number;
  /** MW of Powergrid the colony's whole pin set is budgeted against. */
  powergrid: number;
}

/**
 * The colony budget and the pin costs it pays for — the numbers a pin-layout
 * plan is sized against, all of them the same for every planet type.
 */
/**
 * The Link type's own cost attributes (2280). A link draws CPU and Powergrid
 * like any other pin, plus a per-km term over the distance between the two
 * pins it joins — which is why `pi-planet-radius.json` ships alongside this.
 */
export interface PiLinkSpec {
  /** Base cost, before the per-km term. */
  cpu: number;
  powergrid: number;
  cpuPerKm: number;
  powergridPerKm: number;
  /** Applied as a power of the link's level. See `engine/pi/linkCost.ts`. */
  cpuLevelModifier: number;
  powergridLevelModifier: number;
}

export interface PiInfrastructure {
  /** Per-pin CPU/Powergrid cost and capacity, one entry per `PiPinKind`. */
  pins: Record<PiPinKind, PiPinSpec>;
  /**
   * Pin typeID -> its kind. Every pin is planet-type-specific — a Temperate
   * Basic Industry Facility and a Storm one are different typeIDs at the same
   * cost — so this is how a live colony's own `pins[]` is read: the ESI pin
   * carries a `type_id` and nothing else that says what it is. Command
   * Centers are absent: they supply the budget and draw nothing from it.
   */
  pinKindByTypeId: Record<string, PiPinKind>;
  /**
   * The eight Command Center typeIDs, one per planet type. Every colony has
   * exactly one, and it is deliberately absent from `pinKindByTypeId` — a
   * Command Center supplies the budget and draws nothing from it, so it has
   * no cost row. It still has to be recognisable, or a reader of a live
   * colony's pins reports the one pin every colony has as unrecognised.
   */
  commandCenterTypeIds: number[];
  /**
   * One Extractor Control Unit head's own draw, on top of the ECU's
   * (attributes 1690/1691). A head is fitted per resource-reach, so its cost
   * scales with how many the user places rather than being part of the ECU.
   */
  extractorHead: { cpu: number; powergrid: number };
  /**
   * CPU/Powergrid the Command Center supplies, indexed by its own upgrade
   * level — `commandCenterUpgrades[3]` is level 3. Level 0 is the only row the
   * SDE carries; see `scripts/build-sde.mjs` for where the rest come from and
   * what the build asserts about them.
   */
  link: PiLinkSpec;
  commandCenterUpgrades: PiCommandCenterLevel[];
}

/** public/data/pi.json: how planetary commodities are made. */
export interface PiData {
  /** Produced typeID -> its schematic. */
  schematics: Record<string, PiSchematic>;
  /** P0 resources, sorted by typeID ascending. */
  raw: PiRawResource[];
  /** CPU/Powergrid budget and per-pin costs — see `PiInfrastructure`. */
  infrastructure: PiInfrastructure;
  /**
   * Planet typeID -> the `PlanetType` string ESI reports for a colony. Keyed
   * by the typeID `/universe/planets/{id}` returns, which is how a planet in
   * a system the character has no colony on is identified at all. Several
   * typeIDs map to one planet type, and a planet whose typeID is absent
   * (Shattered, Scorched Barren) supports no colony.
   */
  planetTypeByTypeId: Record<string, PlanetType>;
}
