/** The Thera / Turnur page's Hub and Fits choices, shared by its URL params and its filter row. */
import {
  THERA_HUBS,
  WORMHOLE_SHIP_SIZES,
  type TheraHub,
  type WormholeShipSize,
} from '@/engine/route/theraConnections';

export const HUB_OPTIONS = ['all', ...THERA_HUBS] as const;
export const SIZE_OPTIONS = ['any', ...WORMHOLE_SHIP_SIZES] as const;
export type HubOption = TheraHub | 'all';
export type SizeOption = WormholeShipSize | 'any';
