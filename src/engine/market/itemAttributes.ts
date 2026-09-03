/**
 * Groups an item's ESI dogma attribute values by SDE category, resolving
 * each to its display name and unit via the attribute dictionary
 * (scripts/build-sde.mjs, CONTEXT.md round 6 "Item Detail"). Pure — callers
 * adapt ESI/SDE shapes at the boundary. An attribute id with no dictionary
 * entry (unpublished, or published but nameless) is skipped rather than
 * shown as a raw identifier — a curated allow-list was rejected for the same
 * reason: it would silently drop whatever mattered for an item class nobody
 * thought about.
 */
import {
  enumUnitLabel,
  idReferenceKind,
  isEnumUnit,
  looksLikeId,
  type IdReferenceKind,
} from './attributeUnits';

export interface RawDogmaAttribute {
  attribute_id: number;
  value: number;
}

export interface AttributeDictionaryEntry {
  name: string;
  unit: string | null;
  category: string;
}

export type AttributeDictionary = Readonly<Record<number, AttributeDictionaryEntry>>;

export interface DisplayAttribute {
  attributeId: number;
  name: string;
  /**
   * Null once the "unit" is not a suffix to append (`attributeUnits`): always
   * for an enum legend, so a value it doesn't name shows as a bare number;
   * for an id reference only once something has actually named the id, so an
   * unresolved one keeps rendering as it does today.
   */
  unit: string | null;
  value: number;
  /**
   * Overrides value/unit in display: a required-skill row's
   * "<Skill name> <roman level>", an enum legend's member ("True", "Large"),
   * or the name an id reference points at — see `attributeUnits`.
   */
  displayValue?: string;
}

export interface AttributeGroup {
  category: string;
  attributes: DisplayAttribute[];
}

/**
 * Names for the ids dogma attributes reference (`attributeUnits`). Both maps
 * are optional and partial: an id with no name simply keeps rendering as the
 * raw value it does today. `attributeID` references need no map — the
 * dictionary already names every attribute.
 */
export interface AttributeReferenceNames {
  /** typeID -> name. Skill names are type names, so one map serves both. */
  types?: Readonly<Record<number, string>>;
  /** groupID -> item **Group** name (`invGroups`), never a Market Group. */
  groups?: Readonly<Record<number, string>>;
}

/** The ids an item's attributes reference, for a caller to resolve names for. */
export interface AttributeIdReferences {
  typeIds: number[];
  groupIds: number[];
}

/**
 * Which ids `dogmaAttributes` points at, de-duplicated and split by kind, so
 * a caller can resolve them in one round trip per kind instead of one per
 * row. Includes the required-skill typeIDs: they are ordinary type
 * references, and folding them in here means one lookup covers the lot.
 * `attributeID` references are omitted — `groupItemAttributes` resolves those
 * from the dictionary it is already given.
 */
export function collectAttributeIdReferences(
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined,
  dictionary: AttributeDictionary
): AttributeIdReferences {
  const typeIds = new Set<number>();
  const groupIds = new Set<number>();
  for (const { attribute_id, value } of dogmaAttributes ?? []) {
    const unit = dictionary[attribute_id]?.unit;
    if (!looksLikeId(value)) continue;
    const kind = idReferenceKind(unit);
    if (kind === 'type') typeIds.add(value);
    else if (kind === 'group') groupIds.add(value);
  }
  return { typeIds: [...typeIds], groupIds: [...groupIds] };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/**
 * requiredSkillN -> requiredSkillNLevel dogma attribute id pairs (verified
 * against fuzzwork dgmAttributeTypes.csv, same source as
 * scripts/build-sde.mjs's PREREQ_PAIRS). The level half of each pair is
 * unpublished in dgmAttributeTypes.csv, so it never reaches `dictionary` —
 * these must be read from the raw dogma attributes before the generic
 * per-attribute loop below, or the level is silently lost. ESI omits a level
 * attribute entirely when the item requires level 1 (dogma's own default),
 * so a missing level pairs to 1 rather than being dropped.
 */
const SKILL_REQUIREMENT_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];

/**
 * The name `value` references, or null to leave the row as the raw value plus
 * its unit. Null is deliberately not a `#id` placeholder: unlike an enum
 * legend, "1,201 typeID" is not noise — it says the number is a type id — so
 * an unresolved reference is left exactly as it renders today.
 */
function idReferenceName(
  kind: IdReferenceKind,
  value: number,
  dictionary: AttributeDictionary,
  names: AttributeReferenceNames
): string | null {
  if (!looksLikeId(value)) return null;
  if (kind === 'attribute') return dictionary[value]?.name ?? null;
  const map = kind === 'type' ? names.types : names.groups;
  return map?.[value] ?? null;
}

/** Groups by category, sorted alphabetically; attributes within a group sorted by display name. */
export function groupItemAttributes(
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined,
  dictionary: AttributeDictionary,
  names: AttributeReferenceNames = {}
): AttributeGroup[] {
  if (!dogmaAttributes || dogmaAttributes.length === 0) return [];

  const byId = new Map(dogmaAttributes.map((a) => [a.attribute_id, a.value]));
  const pairedAttributeIds = new Set(SKILL_REQUIREMENT_PAIRS.flat());

  const byCategory = new Map<string, DisplayAttribute[]>();
  const push = (attribute: DisplayAttribute, category: string) => {
    let list = byCategory.get(category);
    if (!list) {
      list = [];
      byCategory.set(category, list);
    }
    list.push(attribute);
  };

  for (const [skillAttrId, levelAttrId] of SKILL_REQUIREMENT_PAIRS) {
    const skillTypeId = byId.get(skillAttrId);
    if (skillTypeId === undefined) continue;
    const entry = dictionary[skillAttrId];
    if (!entry) continue;
    const level = byId.get(levelAttrId) ?? 1;
    const skillName = names.types?.[skillTypeId] ?? `#${skillTypeId}`;
    push(
      {
        attributeId: skillAttrId,
        name: entry.name,
        unit: null,
        value: skillTypeId,
        displayValue: `${skillName} ${ROMAN[Math.max(1, Math.min(5, level)) - 1]}`,
      },
      entry.category
    );
  }

  for (const { attribute_id, value } of dogmaAttributes) {
    if (pairedAttributeIds.has(attribute_id)) continue;
    const entry = dictionary[attribute_id];
    if (!entry) continue;
    const kind = idReferenceKind(entry.unit);
    const resolved =
      kind === null
        ? enumUnitLabel(entry.unit, value)
        : idReferenceName(kind, value, dictionary, names);
    // An enum legend is never a suffix worth keeping, resolved or not; an id
    // reference keeps its unit until something actually resolves it.
    const dropUnit = kind === null ? isEnumUnit(entry.unit) : resolved !== null;
    push(
      {
        attributeId: attribute_id,
        name: entry.name,
        unit: dropUnit ? null : entry.unit,
        value,
        ...(resolved === null ? {} : { displayValue: resolved }),
      },
      entry.category
    );
  }

  const groups = [...byCategory.entries()].map(([category, attributes]) => ({
    category,
    attributes: attributes.sort((a, b) => a.name.localeCompare(b.name)),
  }));
  groups.sort((a, b) => a.category.localeCompare(b.category));
  return groups;
}
