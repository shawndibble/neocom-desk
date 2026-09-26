/**
 * Market Group ids (public/data/market/groups.json) for the Skill Plan
 * Editor's What-If Implants and Booster cross-links. `ATTRIBUTE_ENHANCERS`'s
 * children are the 5 per-slot implant groups (verified against the
 * attribute_id -> AttributeName table in `features/skills/dogma.ts`, e.g.
 * Memory Augmentation -> attribute 177 -> memory). `CEREBRAL_ACCELERATORS`
 * is the flat group under Implants & Boosters holding the skill-training
 * accelerators — not the Booster group (977), whose slots are combat boosters.
 */

export const ATTRIBUTE_ENHANCERS_MARKET_GROUP_ID = 532;
export const CEREBRAL_ACCELERATORS_MARKET_GROUP_ID = 2487;
