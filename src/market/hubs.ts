import type { SecurityBand } from '@/engine/securityStatus';

/**
 * Trade Hub constants for Build Plan price lookups (GLOSSARY.md, ADR 0002).
 * Station/system/region IDs verified against ESI
 * (/universe/stations/{id}, /universe/systems/{id}, /universe/regions/{id})
 * 2026-08-29.
 */

export interface TradeHub {
  id: 'jita' | 'amarr' | 'dodixie' | 'rens' | 'hek' | 'manifest';
  name: string;
  /** Short solar-system name (distinct from `name`, the full station name) — for compact UI labels. */
  systemName: string;
  /**
   * The station as traders say it ("Jita 4-4": planet and moon), naming a
   * price taken at the station rather than region-wide, e.g. Price History's
   * "Jita 4-4 buy" line. A proper name, so not translated.
   */
  stationLabel: string;
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
  /** The hub region's name, for labels such as "Lowest in The Forge". */
  regionName: string;
  /**
   * The hub station's NPC owner and that owner's faction, for broker-fee
   * standings. Stored rather than fetched: `GET /corporations/{id}` omits
   * `faction_id` for NPC corps (only militias carry it), so the live lookup
   * could never find the faction, and it cost one request per hub on every
   * cold page load. Owners from `/universe/stations/{id}`, factions from the
   * SDE's `crpNPCCorporations.factionID`, read 2026-09-25.
   */
  ownerCorporationId: number;
  ownerFactionId: number;
  /**
   * Whether the daily backend jobs (open prices, hauling books, LP store
   * volume) publish this hub's region (`functions/src/marketOpenPrices.ts`,
   * mirrored by `functionsParity.test.ts`). A feature that reads their output
   * skips a hub where this is false.
   */
  dailyJobs: boolean;
  /**
   * Whether "every hub" views (the compare tables and cards, Appraisal's
   * other-hub prices, Hauling's Any hub) include the hub. Manifest is a hub a
   * pilot can pick and price at, but a pilot who lives in Exordium is not
   * shopping around the five empire hubs, so those views stay at five.
   */
  compared: boolean;
  /**
   * Extra broker-fee points a hub charges on top of the skill and standing
   * rate. Exordium's market fees run higher than empire space; the 5 is the
   * EVE University wiki's "additional 5% market fees on non-instant orders"
   * (read 2026-11-01), which does not say whether it is broker fee, sales tax
   * or both. Provisional until measured in game (tracked in the ticket linked
   * from the Manifest scope decision).
   */
  brokerSurchargePct: number;
}

export const TRADE_HUBS: readonly TradeHub[] = [
  {
    id: 'jita',
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemName: 'Jita',
    stationLabel: 'Jita 4-4',
    security: 'highsec',
    stationId: 60003760,
    systemId: 30000142,
    regionId: 10000002,
    regionName: 'The Forge',
    ownerCorporationId: 1000035, // Caldari Navy
    ownerFactionId: 500001, // Caldari State
    dailyJobs: true,
    compared: true,
    brokerSurchargePct: 0,
  },
  {
    id: 'amarr',
    name: 'Amarr VIII (Oris) - Emperor Family Academy',
    systemName: 'Amarr',
    stationLabel: 'Amarr VIII',
    security: 'highsec',
    stationId: 60008494,
    systemId: 30002187,
    regionId: 10000043,
    regionName: 'Domain',
    ownerCorporationId: 1000086, // Emperor Family
    ownerFactionId: 500003, // Amarr Empire
    dailyJobs: true,
    compared: true,
    brokerSurchargePct: 0,
  },
  {
    id: 'dodixie',
    name: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
    systemName: 'Dodixie',
    stationLabel: 'Dodixie IX-20',
    security: 'highsec',
    stationId: 60011866,
    systemId: 30002659,
    regionId: 10000032,
    regionName: 'Sinq Laison',
    ownerCorporationId: 1000120, // Federation Navy
    ownerFactionId: 500004, // Gallente Federation
    dailyJobs: true,
    compared: true,
    brokerSurchargePct: 0,
  },
  {
    id: 'rens',
    name: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
    systemName: 'Rens',
    stationLabel: 'Rens VI-8',
    security: 'highsec',
    stationId: 60004588,
    systemId: 30002510,
    regionId: 10000030,
    regionName: 'Heimatar',
    ownerCorporationId: 1000049, // Brutor Tribe
    ownerFactionId: 500002, // Minmatar Republic
    dailyJobs: true,
    compared: true,
    brokerSurchargePct: 0,
  },
  {
    id: 'hek',
    name: 'Hek VIII - Moon 12 - Boundless Creation Factory',
    systemName: 'Hek',
    stationLabel: 'Hek VIII-12',
    security: 'highsec',
    stationId: 60005686,
    systemId: 30002053,
    regionId: 10000042,
    regionName: 'Metropolis',
    ownerCorporationId: 1000057, // Boundless Creation
    ownerFactionId: 500002, // Minmatar Republic
    dailyJobs: true,
    compared: true,
    brokerSurchargePct: 0,
  },
  {
    id: 'manifest',
    name: 'Manifest V - AIR Laboratories Trade Center',
    systemName: 'Manifest',
    stationLabel: 'Manifest V',
    security: 'highsec',
    stationId: 60015249,
    systemId: 30100032,
    regionId: 10001004,
    regionName: 'Exordium',
    ownerCorporationId: 1000413, // AIR Laboratories
    ownerFactionId: 500028, // AIR Laboratories (the SDE's faction for the corp)
    dailyJobs: true,
    compared: false,
    brokerSurchargePct: 5,
  },
] as const;

/** The id of a hub the "every hub" views cover: every hub but Manifest. */
export type ComparedHubId = Exclude<TradeHub['id'], 'manifest'>;

/** The hubs "every hub" views cover; see `TradeHub.compared`. */
export type ComparedHub = TradeHub & { id: ComparedHubId };

export const COMPARED_HUBS: readonly ComparedHub[] = TRADE_HUBS.filter(
  (hub): hub is ComparedHub => hub.compared
);

/** The hubs the daily backend jobs cover; see `TradeHub.dailyJobs`. */
export const DAILY_JOB_HUBS: readonly TradeHub[] = TRADE_HUBS.filter((hub) => hub.dailyJobs);

/** Default Trade Hub for a fresh Build Plan (GLOSSARY.md: "Jita 4-4 (default)"). */
export const DEFAULT_TRADE_HUB: TradeHub = TRADE_HUBS[0];

export function getTradeHub(id: string): TradeHub | undefined {
  return TRADE_HUBS.find((hub) => hub.id === id);
}
