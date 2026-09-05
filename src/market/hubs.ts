import type { SecurityBand } from '@/engine/securityStatus';

/**
 * Trade Hub constants for Build Plan price lookups (CONTEXT.md, ADR 0002).
 * Station/system/region IDs verified against ESI
 * (/universe/stations/{id}, /universe/systems/{id}, /universe/regions/{id})
 * 2026-08-29.
 */

export interface TradeHub {
  id: 'jita' | 'amarr' | 'dodixie' | 'rens' | 'hek';
  name: string;
  /** Short solar-system name (distinct from `name`, the full station name) — for compact UI labels. */
  systemName: string;
  /**
   * The hub system's security band, for a Build Plan that names no build
   * system of its own and therefore builds at its hub. Every hub is highsec by
   * construction — an NPC trade hub is not somewhere CONCORD is absent — and
   * the raw statuses back that up (Jita 0.946, Amarr 0.949, Dodixie 0.868,
   * Rens 0.895, Hek 0.800, read from `/universe/systems/{id}` 2026-09-05).
   * Stored rather than fetched so a plan can derive its band offline.
   */
  security: SecurityBand;
  stationId: number;
  systemId: number;
  regionId: number;
}

export const TRADE_HUBS: readonly TradeHub[] = [
  {
    id: 'jita',
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemName: 'Jita',
    security: 'highsec',
    stationId: 60003760,
    systemId: 30000142,
    regionId: 10000002, // The Forge
  },
  {
    id: 'amarr',
    name: 'Amarr VIII (Oris) - Emperor Family Academy',
    systemName: 'Amarr',
    security: 'highsec',
    stationId: 60008494,
    systemId: 30002187,
    regionId: 10000043, // Domain
  },
  {
    id: 'dodixie',
    name: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
    systemName: 'Dodixie',
    security: 'highsec',
    stationId: 60011866,
    systemId: 30002659,
    regionId: 10000032, // Sinq Laison
  },
  {
    id: 'rens',
    name: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
    systemName: 'Rens',
    security: 'highsec',
    stationId: 60004588,
    systemId: 30002510,
    regionId: 10000030, // Heimatar
  },
  {
    id: 'hek',
    name: 'Hek VIII - Moon 12 - Boundless Creation Factory',
    systemName: 'Hek',
    security: 'highsec',
    stationId: 60005686,
    systemId: 30002053,
    regionId: 10000042, // Metropolis
  },
] as const;

/** Default Trade Hub for a fresh Build Plan (CONTEXT.md: "Jita 4-4 (default)"). */
export const DEFAULT_TRADE_HUB: TradeHub = TRADE_HUBS[0];

export function getTradeHub(id: TradeHub['id']): TradeHub | undefined {
  return TRADE_HUBS.find((hub) => hub.id === id);
}
