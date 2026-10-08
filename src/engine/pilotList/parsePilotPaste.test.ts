import { describe, expect, it } from 'vitest';
import { classifyPilotPaste, MAX_LIST_PILOTS } from './parsePilotPaste';

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
      text,
    });
  });

  it('needs two D-Scan lines too', () => {
    expect(classifyPilotPaste('626\tMy Vexor\tVexor\t1 km')).toBeNull();
  });
});
