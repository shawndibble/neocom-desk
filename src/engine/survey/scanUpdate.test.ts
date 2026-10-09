import { describe, expect, it } from 'vitest';
import type { SurveyRock } from './series';
import { classifyScan, SCAN_UPDATE_TOLERANCE } from './scanUpdate';

const rocks = (...rows: [string, number][]): SurveyRock[] =>
  rows.map(([ore, volume]) => ({ ore, volume }));

describe('classifyScan', () => {
  const latest = rocks(['Veldspar', 1000], ['Veldspar', 500], ['Scordite', 800]);

  it('is an update when nothing changed', () => {
    expect(classifyScan(latest, latest)).toBe('update');
  });

  it('is an update when rocks shrank or were mined out', () => {
    expect(classifyScan(latest, rocks(['Veldspar', 900], ['Scordite', 100]))).toBe('update');
  });

  it('is an update when a whole ore is gone', () => {
    expect(classifyScan(latest, rocks(['Veldspar', 1200]))).toBe('update');
  });

  it('is an update when an emptied field is pasted back empty', () => {
    expect(classifyScan(latest, [])).toBe('update');
  });

  it('compares per ore, so fewer rocks of an ore carrying the same m3 still fit', () => {
    expect(classifyScan(latest, rocks(['Veldspar', 1500]))).toBe('update');
  });

  it('allows rounding-sized growth of an ore', () => {
    const grown = 1500 * (1 + SCAN_UPDATE_TOLERANCE / 2);
    expect(classifyScan(latest, rocks(['Veldspar', grown]))).toBe('update');
  });

  it('is different when an ore grew past the tolerance', () => {
    const grown = 1500 * (1 + SCAN_UPDATE_TOLERANCE * 3);
    expect(classifyScan(latest, rocks(['Veldspar', grown]))).toBe('different');
  });

  it('is different when an ore appears that the scan never showed', () => {
    expect(classifyScan(latest, rocks(['Veldspar', 100], ['Pyroxeres', 10]))).toBe('different');
  });

  it('is different from an empty field', () => {
    expect(classifyScan([], rocks(['Veldspar', 100]))).toBe('different');
  });

  it('has nothing to be an update of before the first scan', () => {
    expect(classifyScan(null, rocks(['Veldspar', 100]))).toBe('different');
  });
});
