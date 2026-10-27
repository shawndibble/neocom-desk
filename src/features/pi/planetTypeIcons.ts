import type { PlanetType } from '@/engine/pi/goalTypes';

/** The EVE type each planet type's image is served under. */
export const PLANET_TYPE_ICON_ID: Record<PlanetType, number> = {
  temperate: 11,
  ice: 12,
  gas: 13,
  oceanic: 2014,
  lava: 2015,
  barren: 2016,
  storm: 2017,
  plasma: 2063,
};
