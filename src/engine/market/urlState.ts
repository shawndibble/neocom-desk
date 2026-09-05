/**
 * Market Browser URL state (issue #4, CONTEXT.md round 7): the selected item
 * and the current location are query parameters, not path segments — routes
 * are keyed by literal path. Pure parsing/serialising only; the caller (the
 * route) is responsible for validating a parsed id against the loaded
 * catalogue and falling back to the default view when it doesn't resolve.
 */

export interface ParsedMarketParams {
  typeId: number | null;
  hubId: string | null;
  regionId: number | null;
  /** A Market Group to land expanded-open on — independent of typeId/location. */
  groupId: number | null;
}

export type MarketLocationParam =
  { mode: 'hub'; hubId: string } | { mode: 'region'; regionId: number };

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function nonEmpty(raw: string | null): string | null {
  return raw !== null && raw.length > 0 ? raw : null;
}

export function parseMarketParams(get: (key: string) => string | null): ParsedMarketParams {
  return {
    typeId: parsePositiveInt(get('type')),
    hubId: nonEmpty(get('hub')),
    regionId: parsePositiveInt(get('region')),
    groupId: parsePositiveInt(get('group')),
  };
}

export function buildMarketParams(
  typeId: number | null,
  location: MarketLocationParam
): Record<string, string> {
  const params: Record<string, string> = {};
  if (typeId !== null) params.type = String(typeId);
  if (location.mode === 'hub') params.hub = location.hubId;
  else params.region = String(location.regionId);
  return params;
}

/**
 * A bare `?group=` cross-link: no typeId, no location — the caller has
 * neither, and Market Browser's own Location Mode default already covers it.
 */
export function buildMarketGroupParams(groupId: number): Record<string, string> {
  return { group: String(groupId) };
}

/**
 * Whether a parsed id names something real, without erroring while the
 * catalogue it would be checked against is still loading: `null` catalogue
 * (first load) reads as "not yet known to be invalid", matching the
 * degrade-to-default behaviour once loading finishes and the id turns out
 * not to exist.
 */
export function resolveAgainstCatalogue<T>(
  id: number | null,
  catalogue: readonly T[] | null,
  matches: (item: T, id: number) => boolean
): boolean {
  if (id === null) return false;
  if (catalogue === null) return true;
  return catalogue.some((item) => matches(item, id));
}

/**
 * The Market Browser's Location Mode precedence (CONTEXT.md round 7/9,
 * issue #4): a valid region param wins, then a valid hub param, then the
 * device-local Location Mode preference. `valid` is supplied by the caller —
 * region validity depends on the (possibly still-loading) Market Region
 * catalogue, which this pure function has no way to reach itself.
 */
export function resolveMarketLocation(
  parsed: { regionId: number | null; hubId: string | null },
  valid: { region: boolean; hub: boolean },
  fallback: MarketLocationParam
): MarketLocationParam {
  if (parsed.regionId !== null && valid.region)
    return { mode: 'region', regionId: parsed.regionId };
  if (parsed.hubId !== null && valid.hub) return { mode: 'hub', hubId: parsed.hubId };
  return fallback;
}
