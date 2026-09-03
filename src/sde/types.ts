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

/** public/data/pi.json: how planetary commodities are made. */
export interface PiData {
  /** Produced typeID -> its schematic. */
  schematics: Record<string, PiSchematic>;
  /** P0 resources, sorted by typeID ascending. */
  raw: PiRawResource[];
}
