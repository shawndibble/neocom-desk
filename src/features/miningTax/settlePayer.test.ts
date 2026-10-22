import { describe, expect, it } from 'vitest';
import { defaultPayer, payerOptions, type PayableRow } from './settlePayer';

const row = (characterId: number, characterName: string, taxOwed: number): PayableRow => ({
  assignment: { characterId, taxOwed },
  characterName,
});

const ARCHANGEL = 1;
const OTICHODA = 2;

describe('payerOptions', () => {
  it('gives one option per character, with its subtotal and entry count, most owed first', () => {
    const rows = [
      row(ARCHANGEL, 'Ashken Archangel', 100),
      row(OTICHODA, 'Ashken Otichoda', 300),
      row(ARCHANGEL, 'Ashken Archangel', 50),
    ];
    expect(payerOptions(rows)).toEqual([
      { characterId: OTICHODA, characterName: 'Ashken Otichoda', subtotal: 300, count: 1 },
      { characterId: ARCHANGEL, characterName: 'Ashken Archangel', subtotal: 150, count: 2 },
    ]);
  });

  it('breaks a subtotal tie by name', () => {
    const rows = [row(OTICHODA, 'Zed', 100), row(ARCHANGEL, 'Amy', 100)];
    expect(payerOptions(rows).map((o) => o.characterName)).toEqual(['Amy', 'Zed']);
  });

  it('is empty for no rows', () => {
    expect(payerOptions([])).toEqual([]);
  });
});

describe('defaultPayer', () => {
  it('is the one character when every entry is theirs, whoever is active', () => {
    const rows = [row(OTICHODA, 'Ashken Otichoda', 10), row(OTICHODA, 'Ashken Otichoda', 20)];
    expect(defaultPayer(rows, ARCHANGEL)).toBe(OTICHODA);
  });

  it('is the active character when the entries are mixed and it has some', () => {
    const rows = [row(ARCHANGEL, 'Ashken Archangel', 10), row(OTICHODA, 'Ashken Otichoda', 900)];
    expect(defaultPayer(rows, ARCHANGEL)).toBe(ARCHANGEL);
  });

  it('is the character owing most when the active one has none of the mixed entries', () => {
    const rows = [row(ARCHANGEL, 'Ashken Archangel', 10), row(OTICHODA, 'Ashken Otichoda', 900)];
    expect(defaultPayer(rows, 99)).toBe(OTICHODA);
    expect(defaultPayer(rows, null)).toBe(OTICHODA);
  });

  it('is null with no entries', () => {
    expect(defaultPayer([], ARCHANGEL)).toBeNull();
  });
});
