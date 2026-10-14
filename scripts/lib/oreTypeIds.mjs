// oreAndIceTypeIds.json: every ore/ice type the Moon Mining Tax ledger should
// recognise. The market tree alone misses ore CCP never put on the market —
// mission-only variants like Banidine, Augumene and Green Arisite — which the
// ledger then flagged "unclassified" and asked the pilot to tag by hand. The
// Asteroid category (25) holds those too, so it joins the market-derived ids.
const ASTEROID_CATEGORY_ID = 25;

export function bakeOreAndIceTypeIds({ types, groups, marketOreTypeIds }) {
  const ids = new Set(marketOreTypeIds);
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    if (groups.get(t.groupID)?.categoryID === ASTEROID_CATEGORY_ID) ids.add(typeID);
  }
  return [...ids].sort((a, b) => a - b);
}
