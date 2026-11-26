const ASTEROID_CATEGORY_ID = 25;

export function bakeOreAndIceTypeIds({ types, groups, marketOreTypeIds }) {
  const ids = new Set(marketOreTypeIds);
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    if (groups.get(t.groupID)?.categoryID === ASTEROID_CATEGORY_ID) ids.add(typeID);
  }
  return [...ids].sort((a, b) => a - b);
}
