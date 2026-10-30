import { describe, expect, it } from 'vitest';
import { defenseOptions, pickedDefense, shownDefense } from './improveSettings';

describe('the Defense control shows the fit’s own tank side', () => {
  it('shows the fit’s side for Keep as is, and a chosen side as itself', () => {
    expect(shownDefense('keep', 'armor')).toBe('armor');
    expect(shownDefense('keep', 'shield')).toBe('shield');
    expect(shownDefense('shield', 'armor')).toBe('shield');
    // No tank side: nothing is selected until the pilot picks one.
    expect(shownDefense('keep', null)).toBe('keep');
  });

  it('a pick of the fit’s own side keeps it; the other side converts', () => {
    expect(pickedDefense('armor', 'armor')).toBe('keep');
    expect(pickedDefense('shield', 'armor')).toBe('shield');
    expect(pickedDefense('armor', null)).toBe('armor');
  });
});

describe('a fit with no tank side', () => {
  it('offers Either beside Shield and Armor, so the pilot can always go back to keeping it', () => {
    expect(defenseOptions(null)).toEqual(['shield', 'armor', 'keep']);
    expect(defenseOptions('armor')).toEqual(['shield', 'armor']);
    expect(shownDefense('keep', null)).toBe('keep');
  });
});
