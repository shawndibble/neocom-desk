export type AbyssalWeatherKind = 'dark' | 'electrical' | 'exotic' | 'gamma' | 'firestorm';
export type AbyssalLevel = 1 | 2 | 3;

export interface AbyssalWeather {
  typeId: number;
  kind: AbyssalWeatherKind;
  level: AbyssalLevel;
  penaltyPercent: 30 | 50 | 70;
}

export const ABYSSAL_WEATHER_KINDS: readonly AbyssalWeatherKind[] = [
  'dark',
  'electrical',
  'exotic',
  'firestorm',
  'gamma',
];

const PENALTY_PERCENT = { 1: 30, 2: 50, 3: 70 } as const;

const FIRST_TYPE_ID: Readonly<Record<AbyssalWeatherKind, number>> = {
  dark: 47378,
  electrical: 47381,
  exotic: 47384,
  gamma: 47387,
  firestorm: 47390,
};

export const ABYSSAL_WEATHER: readonly AbyssalWeather[] = ABYSSAL_WEATHER_KINDS.flatMap((kind) =>
  ([1, 2, 3] as const).map((level) => ({
    typeId: FIRST_TYPE_ID[kind] + level - 1,
    kind,
    level,
    penaltyPercent: PENALTY_PERCENT[level],
  }))
);

export function abyssalWeatherById(typeId: number): AbyssalWeather | undefined {
  return ABYSSAL_WEATHER.find((weather) => weather.typeId === typeId);
}

export function abyssalWeatherOf(kind: AbyssalWeatherKind, level: AbyssalLevel): AbyssalWeather {
  return ABYSSAL_WEATHER.find((weather) => weather.kind === kind && weather.level === level)!;
}
