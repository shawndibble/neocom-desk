import { romanLevel } from '../projection';
import { displayAttributeValue } from '../fittings/attributeUnits';
import {
  enumUnitLabel,
  idReferenceKind,
  isEnumUnit,
  looksLikeId,
  unitRepeatsName,
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
  unitId?: number;
}

export type AttributeDictionary = Readonly<Record<number, AttributeDictionaryEntry>>;

export interface DisplayAttribute {
  attributeId: number;
  name: string;
  unit: string | null;
  value: number;
  unitId?: number;
  skilledValue?: number;
  displayValue?: string;
}

export interface AttributeGroup {
  category: string;
  attributes: DisplayAttribute[];
}

export interface AttributeReferenceNames {
  types?: Readonly<Record<number, string>>;
  groups?: Readonly<Record<number, string>>;
}

export interface AttributeIdReferences {
  typeIds: number[];
  groupIds: number[];
}

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

export const SKILL_REQUIREMENT_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];

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

export interface GroupItemAttributesOptions {
  omitSkillRequirementRows?: boolean;
  omitAttributeIds?: ReadonlySet<number>;
}

const DAMAGE_TYPE_WORDS = ['EM', 'Thermal', 'Kinetic', 'Explosive'] as const;
const DAMAGE_TYPE_WORD = /\b(EM|Thermal|Kinetic|Explosive)\b/i;

export function compareAttributeNames(a: string, b: string): number {
  const keyOf = (name: string) => {
    const match = DAMAGE_TYPE_WORD.exec(name);
    if (!match) return { stem: name, rank: -1 };
    const word = match[1].toLowerCase();
    const rank = DAMAGE_TYPE_WORDS.findIndex((w) => w.toLowerCase() === word);
    return { stem: name.replace(DAMAGE_TYPE_WORD, 'EM'), rank };
  };
  const ka = keyOf(a);
  const kb = keyOf(b);
  return ka.stem.localeCompare(kb.stem) || ka.rank - kb.rank || a.localeCompare(b);
}

export function groupItemAttributes(
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined,
  dictionary: AttributeDictionary,
  names: AttributeReferenceNames = {},
  options: GroupItemAttributesOptions = {}
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

  for (const [skillAttrId, levelAttrId] of options.omitSkillRequirementRows
    ? []
    : SKILL_REQUIREMENT_PAIRS) {
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
        displayValue: `${skillName} ${romanLevel(Math.max(1, Math.min(5, level)))}`,
      },
      entry.category
    );
  }

  for (const { attribute_id, value: raw } of dogmaAttributes) {
    if (pairedAttributeIds.has(attribute_id)) continue;
    if (options.omitAttributeIds?.has(attribute_id)) continue;
    const entry = dictionary[attribute_id];
    if (!entry) continue;
    const value = displayAttributeValue(raw, entry.unitId, entry.unit).value;
    const kind = idReferenceKind(entry.unit);
    const resolved =
      kind === null
        ? enumUnitLabel(entry.unit, value)
        : idReferenceName(kind, value, dictionary, names);
    const dropUnit =
      kind === null
        ? isEnumUnit(entry.unit) || unitRepeatsName(entry.name, entry.unit)
        : resolved !== null;
    push(
      {
        attributeId: attribute_id,
        name: entry.name,
        unit: dropUnit ? null : entry.unit,
        value,
        ...(entry.unitId === undefined ? {} : { unitId: entry.unitId }),
        ...(resolved === null ? {} : { displayValue: resolved }),
      },
      entry.category
    );
  }

  const groups = [...byCategory.entries()].map(([category, attributes]) => ({
    category,
    attributes: attributes.sort((a, b) => compareAttributeNames(a.name, b.name)),
  }));
  groups.sort((a, b) => a.category.localeCompare(b.category));
  return groups;
}
