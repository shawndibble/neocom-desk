import { describe, expect, it } from 'vitest';
import { ABYSSAL_WEATHER, abyssalWeatherById } from './abyssalWeather';

describe('ABYSSAL_WEATHER', () => {
  it('lists the five weathers at three strengths each, by their game beacon type ids', () => {
    expect(ABYSSAL_WEATHER).toHaveLength(15);
    // ESI names (unpublished types): darkness_weather_1..3 = 47378..47380, and so on.
    expect(abyssalWeatherById(47378)).toEqual({ typeId: 47378, kind: 'dark', level: 1 });
    expect(abyssalWeatherById(47383)).toEqual({ typeId: 47383, kind: 'electrical', level: 3 });
    expect(abyssalWeatherById(47384)).toEqual({ typeId: 47384, kind: 'exotic', level: 1 });
    expect(abyssalWeatherById(47389)).toEqual({ typeId: 47389, kind: 'gamma', level: 3 });
    expect(abyssalWeatherById(47390)).toEqual({ typeId: 47390, kind: 'firestorm', level: 1 });
  });

  it('knows nothing of another type id', () => {
    expect(abyssalWeatherById(587)).toBeUndefined();
  });
});
