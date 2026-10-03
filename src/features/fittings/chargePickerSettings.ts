import type { ChargeFilters, ChargeSort } from '@/engine/fittings/chargeChoice';

/** The Charge Picker's view, sort, filters and "Fighting at" — one set for the whole Charges tab. */
export type ChargeView = 'type' | 'faction' | 'chart';

export interface ChargePickerSettings {
  view: ChargeView;
  sort: ChargeSort;
  filters: ChargeFilters;
  /** "Fighting at": figures become what lands at `distanceKm`. */
  fightingAt: boolean;
  distanceKm: number;
}

export const DEFAULT_PICKER_SETTINGS: ChargePickerSettings = {
  view: 'type',
  sort: 'range',
  filters: { tech1Only: false, inCargo: false, usable: false },
  fightingAt: false,
  distanceKm: 20,
};

/** Metres, or null with "Fighting at" off. */
export function pickerDistance(settings: ChargePickerSettings): number | null {
  return settings.fightingAt ? settings.distanceKm * 1000 : null;
}
