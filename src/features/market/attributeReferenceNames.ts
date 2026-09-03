/**
 * Resolves the ids an item's dogma attributes reference into names, for
 * `groupItemAttributes` / `buildCompareMatrix` (see
 * `engine/market/itemAttributes`). Three sources, cheapest first:
 *
 * - **attributeID** references need nothing here — the attribute dictionary
 *   the engine already holds names every attribute.
 * - **typeID** references start from `skills.json` (precached, offline, and
 *   what the required-skill rows have always used), and only the ids it
 *   doesn't cover go to `loadTypeNames` — which reads the local snapshot
 *   before it reaches for ESI. So the common item pays nothing new.
 * - **groupID** references have no local source at all (the snapshot carries
 *   the market tree, not `invGroups`), so they go to `loadGroupNames`.
 *
 * Never rejects: a lookup that fails contributes no names, and the engine
 * then leaves those rows rendering the raw ids they render today. Both
 * modals call this rather than each assembling skill names themselves.
 */
import {
  collectAttributeIdReferences,
  type AttributeDictionary,
  type AttributeReferenceNames,
  type RawDogmaAttribute,
} from '@/engine/market/itemAttributes';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadSkills } from '@/sde/loadSde';
import { loadGroupNames } from './groupNames';

/** Names for every id referenced across `items`, resolved in one round per kind. */
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

  // Only the skills this item actually references: handing the engine all 511
  // would be mostly entries nothing asks about.
  const types: Record<number, string> = {};
  for (const skill of skills) {
    if (typeIds.has(skill.typeID)) types[skill.typeID] = skill.name;
  }
  const missing = [...typeIds].filter((id) => !(id in types));
  if (missing.length > 0) {
    const resolved = await loadTypeNames(missing).catch(() => new Map<number, string>());
    // `loadTypeNames` fills its own "Type #id" placeholder for ids it can't
    // resolve. Passing that on would make an unresolved type reference render
    // unlike an unresolved group or attribute one, and would turn a skill the
    // snapshot missed into "Type #3436 III" instead of the pair loop's own
    // "#3436 III". Drop it and let the row keep its raw value.
    for (const [id, name] of resolved) {
      if (name !== `Type #${id}`) types[id] = name;
    }
  }

  return { types, groups: Object.fromEntries(groups) };
}
