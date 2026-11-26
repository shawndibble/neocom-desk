import type { SecurityBand } from '@/engine/securityStatus';

export interface HubFeeDiscount {
  factor: number;
  untilMs: number;
  fromMs: number;
}

const AMARR_FEE_DISCOUNT_FROM_MS = Date.UTC(2026, 10, 10, 11);

export const AMARR_FEE_DISCOUNT_UNTIL_MS = Date.UTC(2027, 4, 11, 11);

export interface TradeHub {
  id: 'jita' | 'amarr' | 'dodixie' | 'rens' | 'hek' | 'manifest';
  name: string;
  systemName: string;
  stationLabel: string;
  security: SecurityBand;
  stationId: number;
  systemId: number;
  regionId: number;
  regionName: string;
  ownerCorporationId: number;
  ownerFactionId: number;
  dailyJobs: boolean;
  compared: boolean;
  safetyTaxPct: number;
  feeDiscount?: HubFeeDiscount;
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
    ownerCorporationId: 1000035,
    ownerFactionId: 500001,
    dailyJobs: true,
    compared: true,
    safetyTaxPct: 0,
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
    ownerCorporationId: 1000086,
    ownerFactionId: 500003,
    dailyJobs: true,
    compared: true,
    safetyTaxPct: 0,
    feeDiscount: {
      factor: 0.5,
      fromMs: AMARR_FEE_DISCOUNT_FROM_MS,
      untilMs: AMARR_FEE_DISCOUNT_UNTIL_MS,
    },
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
    ownerCorporationId: 1000120,
    ownerFactionId: 500004,
    dailyJobs: true,
    compared: true,
    safetyTaxPct: 0,
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
    ownerCorporationId: 1000049,
    ownerFactionId: 500002,
    dailyJobs: true,
    compared: true,
    safetyTaxPct: 0,
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
    ownerCorporationId: 1000057,
    ownerFactionId: 500002,
    dailyJobs: true,
    compared: true,
    safetyTaxPct: 0,
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
    ownerCorporationId: 1000413,
    ownerFactionId: 500028,
    dailyJobs: false,
    compared: false,
    safetyTaxPct: 5,
  },
] as const;

export type ComparedHubId = Exclude<TradeHub['id'], 'manifest'>;

export type ComparedHub = TradeHub & { id: ComparedHubId };

export const COMPARED_HUBS: readonly ComparedHub[] = TRADE_HUBS.filter(
  (hub): hub is ComparedHub => hub.compared
);

export const DAILY_JOB_HUBS: readonly TradeHub[] = TRADE_HUBS.filter((hub) => hub.dailyJobs);

export const DEFAULT_TRADE_HUB: TradeHub = TRADE_HUBS[0];

export function getTradeHub(id: string): TradeHub | undefined {
  return TRADE_HUBS.find((hub) => hub.id === id);
}

export function hubFeeDiscountFactor(hub: TradeHub | undefined, nowMs: number): number {
  const discount = hub?.feeDiscount;
  if (!discount || nowMs < discount.fromMs || nowMs >= discount.untilMs) return 1;
  return discount.factor;
}
