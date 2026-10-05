import { describe, it, expect } from 'vitest';
import { bakeTypeNames, namesMissingFrom } from './typeNames.mjs';

describe('bakeTypeNames', () => {
  it('keeps every name once, sorted, published or not', () => {
    expect(
      bakeTypeNames(['Large Abyssal Shield Extender', 'Gila', 'Fierce Exotic Filament', 'Gila'])
    ).toEqual(['Fierce Exotic Filament', 'Gila', 'Large Abyssal Shield Extender']);
  });

  it('drops blank names', () => {
    expect(bakeTypeNames(['', '  ', 'Gila'])).toEqual(['Gila']);
  });
});

describe('namesMissingFrom', () => {
  it('lists the names the baked set lacks, ignoring case', () => {
    expect(namesMissingFrom(['Gila', 'Vexor'], ['gila', 'Old Gun I'])).toEqual(['Old Gun I']);
  });
});
