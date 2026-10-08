import { describe, expect, it } from 'vitest';
import { isSurveyScanText, parseSurveyScan } from './parseScan';

// Rows copied from the in-game Survey Scanner results (units, m3, ISK, distance).
const SCAN = [
  'Pyroxeres\t8,016\t2,404 m3\t184,000.00 ISK\t33 km',
  'Pyroxeres II-Grade\t9,840\t2,952 m3\t221,000.00 ISK\t13 km',
  'Pyroxeres III-Grade\t4,268\t1,280 m3\t107,000.00 ISK\t34 km',
  'Veldspar\t82,608\t8,260 m3\t772,000.00 ISK\t23 km',
].join('\n');

describe('parseSurveyScan', () => {
  it('reads ore, units, volume and distance from tab-separated rows', () => {
    expect(parseSurveyScan(SCAN)).toEqual([
      { ore: 'Pyroxeres', units: 8016, volume: 2404, isk: 184_000, distanceM: 33_000 },
      { ore: 'Pyroxeres II-Grade', units: 9840, volume: 2952, isk: 221_000, distanceM: 13_000 },
      { ore: 'Pyroxeres III-Grade', units: 4268, volume: 1280, isk: 107_000, distanceM: 34_000 },
      { ore: 'Veldspar', units: 82608, volume: 8260, isk: 772_000, distanceM: 23_000 },
    ]);
  });

  it('reads the same rows when the tabs arrived as runs of spaces', () => {
    const spaced = SCAN.replace(/\t/g, '    ');
    expect(parseSurveyScan(spaced)).toEqual(parseSurveyScan(SCAN));
  });

  it('accepts m3 written as m³, CRLF line endings, blank lines and plain metres', () => {
    const rows = parseSurveyScan('Scordite\t35,162\t5,274 m³\t570,000.00 ISK\t950 m\r\n\r\n');
    expect(rows).toEqual([
      { ore: 'Scordite', units: 35162, volume: 5274, isk: 570_000, distanceM: 950 },
    ]);
  });

  it('accepts a row without the ISK column and distances in AU', () => {
    const rows = parseSurveyScan('Veldspar\t100\t10 m3\t1.5 AU');
    expect(rows).toEqual([{ ore: 'Veldspar', units: 100, volume: 10, distanceM: 224_396_806_050 }]);
  });

  it('skips the group header line the scanner prints above each ore', () => {
    const text = [
      'Pyroxeres II-Grade',
      'Pyroxeres II-Grade\t2,312\t693 m3\t51,900.00 ISK\t8,656 m',
      'Pyroxeres II-Grade\t9,840\t2,952 m3\t221,000.00 ISK\t12 km',
      'Scordite',
      'Scordite\t35,162\t5,274 m3\t570,000.00 ISK\t36 km',
    ].join('\n');
    expect(parseSurveyScan(text)).toEqual([
      { ore: 'Pyroxeres II-Grade', units: 2312, volume: 693, isk: 51_900, distanceM: 8656 },
      { ore: 'Pyroxeres II-Grade', units: 9840, volume: 2952, isk: 221_000, distanceM: 12_000 },
      { ore: 'Scordite', units: 35162, volume: 5274, isk: 570_000, distanceM: 36_000 },
    ]);
  });

  it('does not accept a header with no rows under it', () => {
    expect(parseSurveyScan('Scordite\nVeldspar')).toBeNull();
  });

  it('reads an ice scan, where a unit is 1,000 m3', () => {
    const ice = [
      'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km',
      'Clear Icicle\t29\t29,000 m3\t5,940,000.00 ISK\t7,222 m',
    ].join('\n');
    expect(parseSurveyScan(ice)).toEqual([
      { ore: 'Clear Icicle', units: 25, volume: 25_000, isk: 5_120_000, distanceM: 28_000 },
      { ore: 'Clear Icicle', units: 29, volume: 29_000, isk: 5_940_000, distanceM: 7222 },
    ]);
  });

  it('returns null for text that is not a survey scan', () => {
    expect(parseSurveyScan('')).toBeNull();
    expect(parseSurveyScan('Tritanium\t1000\nPyerite\t500')).toBeNull();
    expect(parseSurveyScan('[Rifter, Rifter]\nSmall Armor Repairer I')).toBeNull();
  });

  it('returns null when any line is not a scan row', () => {
    expect(parseSurveyScan(`${SCAN}\nsomething else`)).toBeNull();
  });
});

describe('isSurveyScanText', () => {
  it('is true for a scan and false for item lists the Appraisal tab takes', () => {
    expect(isSurveyScanText(SCAN)).toBe(true);
    expect(isSurveyScanText('Tritanium\t1000\nPyerite\t500')).toBe(false);
    expect(isSurveyScanText('Veldspar\t1000 m3')).toBe(false);
  });
});
