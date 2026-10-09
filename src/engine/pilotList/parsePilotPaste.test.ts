import { describe, expect, it } from 'vitest';
import { classifyPilotPaste, MAX_LIST_PILOTS, parseDscanDistance } from './parsePilotPaste';

describe('classifyPilotPaste', () => {
  it('reads two or more plain name lines as a Local list', () => {
    expect(classifyPilotPaste("Alpha One\r\n  Beta-Two \n\nGamma O'Neil")).toEqual({
      kind: 'local',
      names: ['Alpha One', 'Beta-Two', "Gamma O'Neil"],
      overflow: 0,
    });
  });

  it('leaves a single name alone, which keeps the one-pilot lookup', () => {
    expect(classifyPilotPaste('Alpha One')).toBeNull();
    expect(classifyPilotPaste('Alpha One\n\n')).toBeNull();
  });

  it('drops repeated names, ignoring case', () => {
    expect(classifyPilotPaste('Alpha\nalpha\nBeta')).toMatchObject({ names: ['Alpha', 'Beta'] });
  });

  it('is not a Local list when one line is prose or too long for a name', () => {
    expect(classifyPilotPaste('Alpha\nthis, is a sentence!')).toBeNull();
    expect(classifyPilotPaste(`Alpha\n${'x'.repeat(38)}`)).toBeNull();
    expect(classifyPilotPaste('https://example.com\nAlpha')).toBeNull();
  });

  it('keeps the first 40 names and counts the rest', () => {
    const text = Array.from({ length: 52 }, (_, i) => `Pilot ${i}`).join('\n');
    const result = classifyPilotPaste(text);
    if (result?.kind !== 'local') throw new Error('expected a Local list');
    expect(result.names).toHaveLength(MAX_LIST_PILOTS);
    expect(result.overflow).toBe(12);
  });

  it('reads tab-separated lines starting with a type id as a D-Scan', () => {
    const text = '626\tMy Vexor\tVexor\t1,234 km\n11379\t\tHyperion\t-\n626\tOther\tVexor\t2 AU';
    expect(classifyPilotPaste(text)).toEqual({
      kind: 'dscan',
      typeIds: [626, 11379, 626],
      rows: [
        { typeId: 626, name: 'My Vexor', typeName: 'Vexor', distanceKm: 1234 },
        { typeId: 11379, name: '', typeName: 'Hyperion', distanceKm: null },
        { typeId: 626, name: 'Other', typeName: 'Vexor', distanceKm: 2 * 149_597_870.7 },
      ],
      text,
    });
  });

  it('still reads an old scan whose rows carry only a type id', () => {
    const paste = classifyPilotPaste('626\tx\n11379\ty');
    expect(paste).toMatchObject({ kind: 'dscan', typeIds: [626, 11379] });
    if (paste?.kind !== 'dscan') throw new Error('expected a D-Scan');
    expect(paste.rows.map((r) => r.distanceKm)).toEqual([null, null]);
  });

  it('needs two D-Scan lines too', () => {
    expect(classifyPilotPaste('626\tMy Vexor\tVexor\t1 km')).toBeNull();
  });
});

describe('parseDscanDistance', () => {
  it('reads km, m and AU with thousands separators', () => {
    expect(parseDscanDistance('1,234 km')).toBe(1234);
    expect(parseDscanDistance('3,500 m')).toBe(3.5);
    expect(parseDscanDistance('1.5 AU')).toBeCloseTo(224_396_806.05, 1);
    expect(parseDscanDistance('77 km')).toBe(77);
  });

  it('reads a dash, blank or anything else as unknown', () => {
    expect(parseDscanDistance('-')).toBeNull();
    expect(parseDscanDistance('')).toBeNull();
    expect(parseDscanDistance(undefined)).toBeNull();
    expect(parseDscanDistance('far away')).toBeNull();
  });
});
