/**
 * Market Group ids (public/data/market/groups.json) for the Skill Plan
 * Editor's What-If Implants and Booster cross-links. `ATTRIBUTE_ENHANCERS`'s
 * children are the 5 per-slot implant groups (verified against the
 * attribute_id -> AttributeName table in `features/skills/dogma.ts`, e.g.
 * Memory Augmentation -> attribute 177 -> memory); `BOOSTER` is the category
 * itself, not one of its per-slot children.
 */

export const ATTRIBUTE_ENHANCERS_MARKET_GROUP_ID = 532;
export const BOOSTER_MARKET_GROUP_ID = 977;
