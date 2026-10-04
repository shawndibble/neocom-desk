// Which types types.json carries because a Fitting can hold them.
//
// types.json is otherwise built from what a skill, blueprint or reprocessing
// row references, and it is the Fittings tab's only name -> typeID source
// (and fittingSlots.json's type set). A type nothing builds or refines — a
// corvette, an LP booster, a Republic Fleet module, a scout drone, a filament —
// was missing, so a pasted EFT fit naming one read "unknown item".

/** Ship, module, charge, drone, implant (boosters too), deployable, subsystem, fighter. */
const FIT_CATEGORY_IDS = new Set([6, 7, 8, 18, 20, 22, 32, 87]);
// Filaments are Commodities, not a category of their own, but a PvE fit
// carries them in cargo; every filament group is named "... Filaments".
const COMMODITY_CATEGORY_ID = 17;
const FILAMENT_GROUP_NAME = /Filaments$/;

/**
 * Published typeIDs a Fitting can hold.
 *
 * @param {Map<number, {groupID: number, published: boolean}>} types invTypes
 * @param {Map<number, {name: string, categoryID: number}>} groups invGroups
 * @returns {Set<number>}
 */
export function fitTypeIds(types, groups) {
  const ids = new Set();
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    const g = groups.get(t.groupID);
    if (!g) continue;
    const isFilament = g.categoryID === COMMODITY_CATEGORY_ID && FILAMENT_GROUP_NAME.test(g.name);
    if (FIT_CATEGORY_IDS.has(g.categoryID) || isFilament) ids.add(typeID);
  }
  return ids;
}
