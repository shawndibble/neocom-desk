export const PLAN_PATH = '/planetary-industry/plan';

export const PLAN_CUSTOMS_HASH = '#customs';
export const PLAN_CUSTOMS_HREF = `${PLAN_PATH}${PLAN_CUSTOMS_HASH}`;

export function piPlanHref(typeId: number, pathname: string, search: string): string {
  if (!pathname.startsWith(PLAN_PATH)) return `${PLAN_PATH}?type=${typeId}`;
  const params = new URLSearchParams(search);
  params.set('type', String(typeId));
  return `${PLAN_PATH}?${params.toString()}`;
}

export function piColonyHref(planetId: number): string {
  return `/planetary-industry/colonies?colony=${planetId}`;
}

export const PI_MAP_HREF = '/planetary-industry/map';

export const PI_PRODUCT_PARAM = 'product';

const DROPPED_ON_PRODUCT = ['type', 'colony', 'info', 'planet'] as const;

export function piProductHref(typeId: number, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of DROPPED_ON_PRODUCT) params.delete(key);
  params.delete(PI_PRODUCT_PARAM);
  params.set(PI_PRODUCT_PARAM, String(typeId));
  return `${PI_MAP_HREF}?${params.toString()}`;
}

export const PI_PLANET_PARAM = 'planet';

export function piPlanetHref(planetId: number): string {
  return `${PI_MAP_HREF}?${PI_PLANET_PARAM}=${planetId}`;
}

export function parsePiPlanet(search: string): number | null {
  const raw = new URLSearchParams(search).get(PI_PLANET_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function hrefWithoutPiPlanet(location: UrlLocation): string {
  return hrefWithout(location, [PI_PLANET_PARAM]);
}

export function parsePiProduct(search: string): number | null {
  const raw = new URLSearchParams(search).get(PI_PRODUCT_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function hrefWithoutPiProduct(location: UrlLocation): string {
  return hrefWithout(location, [PI_PRODUCT_PARAM]);
}

interface UrlLocation {
  pathname: string;
  search: string;
  hash: string;
}

export function hrefWithout(location: UrlLocation, keys: readonly string[]): string {
  const params = new URLSearchParams(location.search);
  for (const key of keys) params.delete(key);
  const rest = params.toString();
  return `${location.pathname}${rest === '' ? '' : `?${rest}`}${location.hash}`;
}

export const MAP_ONLY_PARAMS = [PI_PRODUCT_PARAM, PI_PLANET_PARAM] as const;

export function productNavigation(location: { pathname: string; search: string; state: unknown }): {
  replace: boolean;
  state: unknown;
} {
  if (location.pathname.startsWith(PI_MAP_HREF) && parsePiProduct(location.search) !== null) {
    return { replace: true, state: location.state };
  }
  return { replace: false, state: null };
}
