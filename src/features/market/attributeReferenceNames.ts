import {
  collectAttributeIdReferences,
  type AttributeDictionary,
  type AttributeReferenceNames,
  type RawDogmaAttribute,
} from '@/engine/market/itemAttributes';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadSkills } from '@/sde/loadSde';
import { loadGroupNames } from './groupNames';

export async function loadAttributeReferenceNames(
  items: readonly (readonly RawDogmaAttribute[] | undefined)[],
  dictionary: AttributeDictionary
): Promise<AttributeReferenceNames> {
  const typeIds = new Set<number>();
  const groupIds = new Set<number>();
  for (const dogmaAttributes of items) {
    const refs = collectAttributeIdReferences(dogmaAttributes, dictionary);
    for (const id of refs.typeIds) typeIds.add(id);
    for (const id of refs.groupIds) groupIds.add(id);
  }

  const [skills, groups] = await Promise.all([
    typeIds.size === 0 ? [] : loadSkills().catch(() => []),
    groupIds.size === 0
      ? new Map<number, string>()
      : loadGroupNames([...groupIds]).catch(() => new Map<number, string>()),
  ]);

  const types: Record<number, string> = {};
  for (const skill of skills) {
    if (typeIds.has(skill.typeID)) types[skill.typeID] = skill.name;
  }
  const missing = [...typeIds].filter((id) => !(id in types));
  if (missing.length > 0) {
    const resolved = await loadTypeNames(missing).catch(() => new Map<number, string>());
    for (const [id, name] of resolved) {
      if (name !== `Type #${id}`) types[id] = name;
    }
  }

  return { types, groups: Object.fromEntries(groups) };
}
