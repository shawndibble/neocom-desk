import { ALL_REGIONS, type RegionChoice } from './locationMode';
import type { JumpRange } from '@/engine/route/jumpRange';

export interface ParsedMarketParams {
  typeId: number | null;
  hubId: string | null;
  regionId: RegionChoice | null;
  groupId: number | null;
}

export type MarketLocationParam =
  { mode: 'hub'; hubId: string } | { mode: 'region'; regionId: RegionChoice };

export function parsePositiveInt(raw: string | null): number | null {
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
    regionId: get('region') === ALL_REGIONS ? ALL_REGIONS : parsePositiveInt(get('region')),
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

export function buildMarketGroupParams(groupId: number): Record<string, string> {
  return { group: String(groupId) };
}

export function resolveAgainstCatalogue<T>(
  id: number | null,
  catalogue: readonly T[] | null,
  matches: (item: T, id: number) => boolean
): boolean {
  if (id === null) return false;
  if (catalogue === null) return true;
  return catalogue.some((item) => matches(item, id));
}

export function marketLinkParams(
  typeId: number,
  currentSearch: string,
  forcedHubId?: string
): Record<string, string> {
  if (forcedHubId !== undefined)
    return buildMarketParams(typeId, { mode: 'hub', hubId: forcedHubId });
  const parsed = parseMarketParams((key) => new URLSearchParams(currentSearch).get(key));
  if (parsed.regionId !== null)
    return buildMarketParams(typeId, { mode: 'region', regionId: parsed.regionId });
  if (parsed.hubId !== null) return buildMarketParams(typeId, { mode: 'hub', hubId: parsed.hubId });
  return { type: String(typeId) };
}

export function marketNearbyParams(
  typeId: number,
  jumps: Exclude<JumpRange, 'any'>
): Record<string, string> {
  return { type: String(typeId), region: ALL_REGIONS, 'browser.jumps': jumps };
}

export function marketItemUrl(typeId: number, currentSearch: string): string {
  return `/market/browser?${new URLSearchParams(marketLinkParams(typeId, currentSearch)).toString()}`;
}

export function resolveMarketLocation(
  parsed: { regionId: RegionChoice | null; hubId: string | null },
  valid: { region: boolean; hub: boolean },
  fallback: MarketLocationParam
): MarketLocationParam {
  if (parsed.regionId === ALL_REGIONS) return { mode: 'region', regionId: ALL_REGIONS };
  if (parsed.regionId !== null && valid.region)
    return { mode: 'region', regionId: parsed.regionId };
  if (parsed.hubId !== null && valid.hub) return { mode: 'hub', hubId: parsed.hubId };
  return fallback;
}
