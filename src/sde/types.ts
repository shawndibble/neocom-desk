// Shapes of the slim SDE JSON emitted by scripts/build-sde.mjs.

export type CharacterAttribute =
  | 'charisma'
  | 'intelligence'
  | 'memory'
  | 'perception'
  | 'willpower';

export interface SkillPrereq {
  skillTypeID: number;
  level: number;
}

/** One entry in public/data/skills.json (SkillType[]). */
export interface SkillType {
  typeID: number;
  name: string;
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
