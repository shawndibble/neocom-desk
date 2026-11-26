import { displayAttributeValue } from '../fittings/attributeUnits';
import { DOGMA_ATTRIBUTE, type Resonances } from '../fittings/types';
import {
  groupItemAttributes,
  type AttributeDictionary,
  type AttributeGroup,
  type AttributeReferenceNames,
  type GroupItemAttributesOptions,
  type RawDogmaAttribute,
} from './itemAttributes';

export type ItemKind = 'hull' | 'module' | 'other';

const SLOT_EFFECT_IDS = new Set([11, 12, 13, 2663, 3772]);

const RACK_SIZE_ATTRIBUTE_IDS = new Set<number>([
  DOGMA_ATTRIBUTE.hiSlots,
  DOGMA_ATTRIBUTE.medSlots,
  DOGMA_ATTRIBUTE.lowSlots,
]);

export function itemKindOf(
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined,
  dogmaEffects: readonly { effect_id: number }[] | undefined
): ItemKind {
  if (dogmaAttributes?.some((a) => RACK_SIZE_ATTRIBUTE_IDS.has(a.attribute_id))) return 'hull';
  if (dogmaEffects?.some((e) => SLOT_EFFECT_IDS.has(e.effect_id))) return 'module';
  return 'other';
}

export type ResistLayerKind = 'shield' | 'armor' | 'hull';

export interface ResistLayer {
  layer: ResistLayerKind;
  hp: number | null;
  resonances: Resonances;
  skilled?: { hp: number | null; resonances: Resonances };
}

export const LAYER_ATTRIBUTES: ReadonlyArray<{
  layer: ResistLayerKind;
  hp: number;
  resonances: Readonly<Record<keyof Resonances, number>>;
}> = [
  {
    layer: 'shield',
    hp: DOGMA_ATTRIBUTE.shieldCapacity,
    resonances: {
      emResonance: DOGMA_ATTRIBUTE.shieldEmResonance,
      thermalResonance: DOGMA_ATTRIBUTE.shieldThermalResonance,
      kineticResonance: DOGMA_ATTRIBUTE.shieldKineticResonance,
      explosiveResonance: DOGMA_ATTRIBUTE.shieldExplosiveResonance,
    },
  },
  {
    layer: 'armor',
    hp: DOGMA_ATTRIBUTE.armorHp,
    resonances: {
      emResonance: DOGMA_ATTRIBUTE.armorEmResonance,
      thermalResonance: DOGMA_ATTRIBUTE.armorThermalResonance,
      kineticResonance: DOGMA_ATTRIBUTE.armorKineticResonance,
      explosiveResonance: DOGMA_ATTRIBUTE.armorExplosiveResonance,
    },
  },
  {
    layer: 'hull',
    hp: DOGMA_ATTRIBUTE.hullHp,
    resonances: {
      emResonance: DOGMA_ATTRIBUTE.hullEmResonance,
      thermalResonance: DOGMA_ATTRIBUTE.hullThermalResonance,
      kineticResonance: DOGMA_ATTRIBUTE.hullKineticResonance,
      explosiveResonance: DOGMA_ATTRIBUTE.hullExplosiveResonance,
    },
  },
];

export type AttributeSection =
  { kind: 'group'; group: AttributeGroup } | { kind: 'resists'; layers: ResistLayer[] };

const RESISTS = Symbol('resists');
type Slot = string | typeof RESISTS;

const ORDER: Readonly<
  Record<
    ItemKind,
    { lead: readonly Slot[]; rest: 'alphabetical' | 'largest'; tail: readonly Slot[] }
  >
> = {
  hull: {
    lead: [
      'Fitting',
      RESISTS,
      'Shield',
      'Armor',
      'Structure',
      'Capacitor',
      'Targeting',
      'Speed and Travel',
      'Drones',
      'Fighter Attributes',
      'Fighter Abilities',
      'Hangars & Bays',
    ],
    rest: 'alphabetical',
    tail: ['Heat', 'Required Skills', 'Other', 'Miscellaneous'],
  },
  module: {
    lead: ['Fitting', RESISTS],
    rest: 'largest',
    tail: ['Capacitor', 'Heat', 'Structure', 'Required Skills', 'Other', 'Miscellaneous'],
  },
  other: {
    lead: [],
    rest: 'largest',
    tail: [
      RESISTS,
      'Shield',
      'Armor',
      'Structure',
      'Heat',
      'Required Skills',
      'Other',
      'Miscellaneous',
    ],
  },
};

export interface ItemAttributeSectionsOptions extends GroupItemAttributesOptions {
  kind: ItemKind;
}

function resistLayers(
  values: ReadonlyMap<number, number>,
  kind: ItemKind,
  omit: ReadonlySet<number> | undefined
): { layers: ResistLayer[]; used: number[] } {
  const layers: ResistLayer[] = [];
  const used: number[] = [];
  const has = (id: number) => values.has(id) && !omit?.has(id);
  for (const { layer, hp, resonances } of LAYER_ATTRIBUTES) {
    const ids = Object.values(resonances);
    if (!ids.every(has)) continue;
    const withHp = kind !== 'module' && has(hp);
    layers.push({
      layer,
      hp: withHp ? values.get(hp)! : null,
      resonances: {
        emResonance: values.get(resonances.emResonance)!,
        thermalResonance: values.get(resonances.thermalResonance)!,
        kineticResonance: values.get(resonances.kineticResonance)!,
        explosiveResonance: values.get(resonances.explosiveResonance)!,
      },
    });
    used.push(...ids, ...(withHp ? [hp] : []));
  }
  return { layers, used };
}

export function itemAttributeSections(
  dogmaAttributes: readonly RawDogmaAttribute[] | undefined,
  dictionary: AttributeDictionary,
  names: AttributeReferenceNames = {},
  options: ItemAttributeSectionsOptions
): AttributeSection[] {
  const values = new Map((dogmaAttributes ?? []).map((a) => [a.attribute_id, a.value]));
  const { layers, used } = resistLayers(values, options.kind, options.omitAttributeIds);
  const groups = groupItemAttributes(dogmaAttributes, dictionary, names, {
    ...options,
    omitAttributeIds: new Set([...(options.omitAttributeIds ?? []), ...used]),
  });

  const byCategory = new Map(groups.map((g) => [g.category, g]));
  const { lead, rest, tail } = ORDER[options.kind];
  const placed = new Set<Slot>([...lead, ...tail]);
  const middle = groups
    .filter((g) => !placed.has(g.category))
    .sort((a, b) =>
      rest === 'largest'
        ? b.attributes.length - a.attributes.length || a.category.localeCompare(b.category)
        : a.category.localeCompare(b.category)
    )
    .map((g) => g.category);

  const sections: AttributeSection[] = [];
  for (const slot of [...lead, ...middle, ...tail]) {
    if (slot === RESISTS) {
      if (layers.length > 0) sections.push({ kind: 'resists', layers });
      continue;
    }
    const group = byCategory.get(slot);
    if (group) sections.push({ kind: 'group', group });
  }
  return sections;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function withSkilledValues(
  sections: readonly AttributeSection[],
  skilled: ReadonlyMap<number, number>
): AttributeSection[] {
  if (skilled.size === 0) return [...sections];
  return sections.map((section) => {
    if (section.kind === 'group') {
      const attributes = section.group.attributes.map((attribute) => {
        const raw = skilled.get(attribute.attributeId);
        if (raw === undefined || attribute.displayValue !== undefined) return attribute;
        const { value } = displayAttributeValue(raw, attribute.unitId, attribute.unit);
        return same(value, attribute.value) ? attribute : { ...attribute, skilledValue: value };
      });
      return { kind: 'group', group: { ...section.group, attributes } };
    }
    const layers = section.layers.map((layer) => {
      const ids = LAYER_ATTRIBUTES.find((entry) => entry.layer === layer.layer);
      if (!ids) return layer;
      const hp = layer.hp === null ? null : (skilled.get(ids.hp) ?? layer.hp);
      const keys = Object.keys(ids.resonances) as (keyof Resonances)[];
      const resonances = { ...layer.resonances };
      for (const key of keys) resonances[key] = skilled.get(ids.resonances[key]) ?? resonances[key];
      const changed =
        (hp !== null && layer.hp !== null && !same(hp, layer.hp)) ||
        keys.some((key) => !same(resonances[key], layer.resonances[key]));
      return changed ? { ...layer, skilled: { hp, resonances } } : layer;
    });
    return { kind: 'resists', layers };
  });
}
