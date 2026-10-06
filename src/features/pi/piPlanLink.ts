/**
 * Where the item menu's "PI Plan" action goes. From anywhere else it opens
 * the planner on that type; on the planner itself it keeps the plan on screen
 * (goals, switched-off colonies) and sets `?type=`, which the route seeds as
 * one more goal — the action adds to the plan instead of replacing it.
 */
export const PLAN_PATH = '/planetary-industry/plan';

/** Plan's customs rate editor: opens "Make a specific product" with Colonies expanded. */
export const PLAN_CUSTOMS_HASH = '#customs';
export const PLAN_CUSTOMS_HREF = `${PLAN_PATH}${PLAN_CUSTOMS_HASH}`;

export function piPlanHref(typeId: number, pathname: string, search: string): string {
  if (!pathname.startsWith(PLAN_PATH)) return `${PLAN_PATH}?type=${typeId}`;
  const params = new URLSearchParams(search);
  params.set('type', String(typeId));
  return `${PLAN_PATH}?${params.toString()}`;
}

/** One colony, opened on the Colonies tab (`?colony=`). */
export function piColonyHref(planetId: number): string {
  return `/planetary-industry/colonies?colony=${planetId}`;
}

/** The Map tab: where to find a planet for a new colony. */
export const PI_MAP_HREF = '/planetary-industry/map';
