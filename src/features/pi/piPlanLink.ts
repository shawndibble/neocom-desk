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

/**
 * `?product=<typeId>`: the product whose drawer the Map tab has open. Every
 * product and item name on the PI tabs links here (DESIGN.md §6c "Entities",
 * Overrides), so the panel is a real URL: new tab, copy link, reload, Back.
 */
export const PI_PRODUCT_PARAM = 'product';

/** Params a product link drops: a goal seed (Plan), an open colony (Colonies), an open Show info, an open planet drawer. */
const DROPPED_ON_PRODUCT = ['type', 'colony', 'info', 'planet'] as const;

/** The Map tab with `typeId`'s drawer open, keeping the page's other params (goals, switched-off colonies). */
export function piProductHref(typeId: number, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of DROPPED_ON_PRODUCT) params.delete(key);
  params.delete(PI_PRODUCT_PARAM);
  params.set(PI_PRODUCT_PARAM, String(typeId));
  return `${PI_MAP_HREF}?${params.toString()}`;
}

/**
 * `?planet=<planetId>`: the Map drawer for one of the pilot's own colonies,
 * where its richness override is set (issue #2685). The Colonies row links
 * here. A product link drops it, so one drawer is open at a time.
 */
export const PI_PLANET_PARAM = 'planet';

/** The Map tab with that colony's richness drawer open. */
export function piPlanetHref(planetId: number): string {
  return `${PI_MAP_HREF}?${PI_PLANET_PARAM}=${planetId}`;
}

/** The planet a search string opens, or null when absent or not a positive whole id. */
export function parsePiPlanet(search: string): number | null {
  const raw = new URLSearchParams(search).get(PI_PLANET_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The same location without `planet`. */
export function hrefWithoutPiPlanet(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  const params = new URLSearchParams(location.search);
  params.delete(PI_PLANET_PARAM);
  const rest = params.toString();
  return `${location.pathname}${rest === '' ? '' : `?${rest}`}${location.hash}`;
}

/** The product a search string opens, or null when absent or not a positive whole id. */
export function parsePiProduct(search: string): number | null {
  const raw = new URLSearchParams(search).get(PI_PRODUCT_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The search string without `product` (`''` or `'?a=b'`). */
export function withoutPiProduct(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PI_PRODUCT_PARAM);
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

/** The same location without `product`. */
export function hrefWithoutPiProduct(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  return `${location.pathname}${withoutPiProduct(location.search)}${location.hash}`;
}

/** The same location without `keys`. */
export function hrefWithout(
  location: { pathname: string; search: string; hash: string },
  keys: readonly string[]
): string {
  const params = new URLSearchParams(location.search);
  for (const key of keys) params.delete(key);
  const rest = params.toString();
  return `${location.pathname}${rest === '' ? '' : `?${rest}`}${location.hash}`;
}

/**
 * Params only the Map reads (its two drawers). A tab switch keeps the search,
 * so these would reopen a drawer on the way back: they are dropped on leaving.
 */
export const MAP_ONLY_PARAMS = [PI_PRODUCT_PARAM, PI_PLANET_PARAM] as const;

/** History state a product link or tile click carries, so Close can go Back instead of replacing. */
export const PI_PRODUCT_PUSHED_STATE = { piProduct: true } as const;

export function wasProductPushedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'piProduct' in state;
}

/**
 * How opening a product navigates from `location`. On the Map, a first open
 * pushes with the marker, so Back and Close agree; a second open while one is
 * already open replaces it, so one Back still closes the drawer. From Plan or
 * Colonies it pushes with no marker: Back returns there, and Close keeps the
 * pilot on the Map they were taken to.
 */
export function productNavigation(location: { pathname: string; search: string; state: unknown }): {
  replace: boolean;
  state: unknown;
} {
  if (!location.pathname.startsWith(PI_MAP_HREF)) return { replace: false, state: null };
  if (parsePiProduct(location.search) !== null) return { replace: true, state: location.state };
  return { replace: false, state: PI_PRODUCT_PUSHED_STATE };
}
