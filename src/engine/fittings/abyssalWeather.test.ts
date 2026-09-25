import { describe, expect, it } from 'vitest';
import { ABYSSAL_WEATHER, abyssalWeatherById } from './abyssalWeather';

describe('ABYSSAL_WEATHER', () => {
  it('lists the five weathers at three strengths each, by their game beacon type ids', () => {
    expect(ABYSSAL_WEATHER).toHaveLength(15);
    // ESI names (unpublished types): darkness_weather_1..3 = 47378..47380, and so on.
    expect(abyssalWeatherById(47378)).toMatchObject({ typeId: 47378, kind: 'dark', level: 1 });
    expect(abyssalWeatherById(47383)).toMatchObject({ kind: 'electrical', level: 3 });
    expect(abyssalWeatherById(47384)).toMatchObject({ kind: 'exotic', level: 1 });
    expect(abyssalWeatherById(47389)).toMatchObject({ kind: 'gamma', level: 3 });
    expect(abyssalWeatherById(47390)).toMatchObject({ kind: 'firestorm', level: 1 });
    // The level-scaled penalty, as the pinned engine applies it.
    expect(ABYSSAL_WEATHER.map((w) => w.penaltyPercent).slice(0, 3)).toEqual([30, 50, 70]);
  });

  it('knows nothing of another type id', () => {
    expect(abyssalWeatherById(587)).toBeUndefined();
  });
});
