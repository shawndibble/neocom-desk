/**
 * The Abyssal Deadspace weathers, as the beacons the game projects onto every
 * ship in a filament's pocket. Each is two buffs: a resist penalty that grows
 * with the level (30 / 50 / 70%) against one damage type, and a fixed bonus —
 * Dark +50% velocity (and a turret range penalty), Electrical halved capacitor
 * recharge time, Exotic +50% scan resolution, Gamma +50% shield HP, Firestorm
 * +50% armor HP. The engine applies them from the beacon; this is just which
 * beacon is which.
 *
 * Type ids from ESI (unpublished types, named e.g. `electric_storm_weather_2`),
 * checked 2026-09-25 against the pinned engine: each level moved the expected
 * attributes, and level 3's penalty is larger than level 1's.
 */
export type AbyssalWeatherKind = 'dark' | 'electrical' | 'exotic' | 'gamma' | 'firestorm';

export interface AbyssalWeather {
  typeId: number;
  kind: AbyssalWeatherKind;
  level: 1 | 2 | 3;
}

/** The first of each kind's three consecutive beacon type ids. */
const FIRST_TYPE_ID: Readonly<Record<AbyssalWeatherKind, number>> = {
  dark: 47378, // darkness_weather_1
  electrical: 47381, // electric_storm_weather_1
  exotic: 47384, // caustic_toxin_weather_1
  gamma: 47387, // xenon_gas_weather_1
  firestorm: 47390, // infernal_weather_1
};

/** In the order the game's filament tiers list them. */
export const ABYSSAL_WEATHER: readonly AbyssalWeather[] = (
  ['dark', 'electrical', 'exotic', 'firestorm', 'gamma'] as const
).flatMap((kind) =>
  ([1, 2, 3] as const).map((level) => ({ typeId: FIRST_TYPE_ID[kind] + level - 1, kind, level }))
);

export function abyssalWeatherById(typeId: number): AbyssalWeather | undefined {
  return ABYSSAL_WEATHER.find((weather) => weather.typeId === typeId);
}
