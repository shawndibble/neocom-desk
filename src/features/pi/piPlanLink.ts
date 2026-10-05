/**
 * Where the item menu's "PI Plan" action goes. From anywhere else it opens
 * the planner on that type; on the planner itself it keeps the plan on screen
 * (goals, switched-off colonies) and sets `?type=`, which the route seeds as
 * one more goal — the action adds to the plan instead of replacing it.
 */
const PLAN_PATH = '/planetary-industry/plan';

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

/**
 * The Advisor on one system (`?system=`), or on its own default without one.
 * It has no tab of its own any more: until it retires, its content sits on
 * the Colonies tab.
 */
export function piAdvisorHref(systemId: number | undefined): string {
  return systemId === undefined
    ? '/planetary-industry/colonies'
    : `/planetary-industry/colonies?system=${systemId}`;
}
