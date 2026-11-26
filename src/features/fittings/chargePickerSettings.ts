import type { ChargeFilters, ChargeSort } from '@/engine/fittings/chargeChoice';

export type ChargeView = 'type' | 'faction' | 'chart';

export interface ChargePickerSettings {
  view: ChargeView;
  sort: ChargeSort;
  filters: ChargeFilters;
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

export function pickerDistance(settings: ChargePickerSettings): number | null {
  return settings.fightingAt ? settings.distanceKm * 1000 : null;
}
