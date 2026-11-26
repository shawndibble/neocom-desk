import { describe, expect, it } from 'vitest';
import { unheldCharacters } from './unheldCharacters';

const book = (corporationId: number, miners: { id: string; characterIds: number[] }[]) => ({
  corporationId,
  corpName: `Corp ${corporationId}`,
  miners: miners.map((m) => ({ ...m, mainCharacterId: m.characterIds[0]! })),
});

describe('unheldCharacters (the "counts as yours" warning)', () => {
  it("names, per corporation, the characters a held character's Miner bills that the pilot does not hold", () => {
    const out = unheldCharacters(
      [
        book(1, [
          { id: 'g1', characterIds: [10, 11, 90] },
          { id: 'g2', characterIds: [12, 91] },
          { id: 'solo:10', characterIds: [10] },
        ]),
        book(2, [{ id: 'g3', characterIds: [10, 11] }]),
      ],
      new Set([10, 11, 12])
    );
    expect(out).toEqual([
      {
        corporationId: 1,
        corpName: 'Corp 1',
        characterIds: [90, 91],
        declines: [
          { characterId: 10, minerId: 'g1' },
          { characterId: 11, minerId: 'g1' },
          { characterId: 12, minerId: 'g2' },
        ],
      },
    ]);
  });

  it('says nothing once each listed character is held, or no held character is grouped with one', () => {
    const books = [book(1, [{ id: 'g1', characterIds: [10, 90] }])];
    expect(unheldCharacters(books, new Set([10, 90]))).toEqual([]);
    expect(
      unheldCharacters([book(1, [{ id: 'g1', characterIds: [90, 91] }])], new Set([10]))
    ).toEqual([]);
  });
});
