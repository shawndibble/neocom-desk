import { describe, expect, it } from 'vitest';
import { looksLikeBlueprintList, parseBlueprintList } from './blueprintList';

const NAMES = new Set([
  'rifter blueprint',
  'fullerene intercalated graphite reaction formula',
  'tritanium blueprint',
]);

describe('parseBlueprintList', () => {
  it('reads blueprints and reaction formulas, ignoring other lines', () => {
    const text = [
      'Rifter Blueprint\t1',
      'Fullerene Intercalated Graphite Reaction Formula\t1',
      'Tritanium\t5000',
    ].join('\n');
    expect(parseBlueprintList(text, NAMES)).toEqual([
      'rifter blueprint',
      'fullerene intercalated graphite reaction formula',
    ]);
  });

  it('collapses duplicates and copy/original spellings of one blueprint', () => {
    const text =
      'Rifter Blueprint\nRifter Blueprint (Copy)\nrifter blueprint\t3\nRifter Blueprint Copy';
    expect(parseBlueprintList(text, NAMES)).toEqual(['rifter blueprint']);
  });
});

describe('looksLikeBlueprintList', () => {
  it('needs a strict majority of blueprint lines', () => {
    expect(looksLikeBlueprintList('Rifter Blueprint\nTritanium Blueprint\nTritanium', NAMES)).toBe(
      true
    );
    expect(looksLikeBlueprintList('Rifter Blueprint\nTritanium', NAMES)).toBe(false);
    expect(looksLikeBlueprintList('Tritanium\nPyerite\nRifter Blueprint', NAMES)).toBe(false);
  });

  it('is false without any blueprint names known', () => {
    expect(looksLikeBlueprintList('Rifter Blueprint', new Set())).toBe(false);
  });
});
