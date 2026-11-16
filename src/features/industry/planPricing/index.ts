/**
 * Prices a Build Plan through one path, so its page, the Build Plans list,
 * Compare, every Build Group and the corp-project and ore readers cannot
 * read a plan differently: resolve, re-resolve at Depth Prices, then the
 * hero's verdict on the pilot's Profit Basis with the product at its
 * troll-capped sale price (`productSalePrice`).
 *
 * Market-Wide (no Depth Prices, no hero basis) and Ranked / All owned
 * (`computeBuildPlan` directly, no Depth Prices) price differently by design.
 */
export { pricePlan, type DepthSource } from './pricePlan';
export { planVerdictOf, type PlanVerdict } from './planVerdict';
export { productSalePrice } from '../productPriceCap';
