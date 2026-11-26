const FIT_CATEGORY_IDS = new Set([6, 7, 8, 18, 20, 22, 32, 87]);
const COMMODITY_CATEGORY_ID = 17;
const FILAMENT_GROUP_NAME = /Filaments$/;
const MUTAPLASMID_GROUP_ID = 1964;

export function fitTypeIds(types, groups) {
  const ids = new Set();
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    const g = groups.get(t.groupID);
    if (!g) continue;
    const isFilament = g.categoryID === COMMODITY_CATEGORY_ID && FILAMENT_GROUP_NAME.test(g.name);
    if (FIT_CATEGORY_IDS.has(g.categoryID) || isFilament || t.groupID === MUTAPLASMID_GROUP_ID)
      ids.add(typeID);
  }
  return ids;
}
