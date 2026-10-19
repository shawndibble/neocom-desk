import { describe, expect, it } from 'vitest';
import type { Miner } from './charges';
import { planAutoGroups, planRegroup } from './grouping';

const miner = (id: string, characterIds: number[], main = characterIds[0]): Miner => ({
  id,
  characterIds,
  mainCharacterId: main,
});

describe('planRegroup', () => {
  it('merges two solo characters into the first one’s Miner id, keeping its billing history', () => {
    const plan = planRegroup({
      miners: [],
      targetId: 'solo:1',
      targetCharacterIds: [1],
      absorb: [{ id: 'solo:2', characterIds: [2] }],
      mainCharacterId: 1,
    });
    expect(plan).toEqual({
      action: 'regroupMiner',
      minerId: 'solo:1',
      characterIds: [1, 2],
      mainCharacterId: 1,
      absorbMinerIds: [],
    });
  });

  it('names a stored group to dissolve, since a character sits in one Miner only', () => {
    const plan = planRegroup({
      miners: [miner('g1', [2, 3])],
      targetId: 'solo:1',
      targetCharacterIds: [1],
      absorb: [{ id: 'g1', characterIds: [2, 3] }],
      mainCharacterId: 3,
    });
    expect(plan).toEqual({
      action: 'regroupMiner',
      minerId: 'solo:1',
      characterIds: [1, 2, 3],
      mainCharacterId: 3,
      absorbMinerIds: ['g1'],
    });
  });

  it('never dissolves a solo Miner, which is not stored', () => {
    const plan = planRegroup({
      miners: [],
      targetId: 'g1',
      targetCharacterIds: [1, 2],
      absorb: [{ id: 'solo:3', characterIds: [3] }],
      mainCharacterId: 1,
    });
    expect(plan.absorbMinerIds).toEqual([]);
  });

  it('refuses a main that is not in the group', () => {
    expect(() =>
      planRegroup({
        miners: [],
        targetId: 'solo:1',
        targetCharacterIds: [1],
        absorb: [{ id: 'solo:2', characterIds: [2] }],
        mainCharacterId: 9,
      })
    ).toThrow(/main/);
  });
});

describe('planAutoGroups', () => {
  const CORP = 98;
  const mine = (characterId: number, corporationId = CORP) => ({ characterId, corporationId });

  it('groups an account’s characters that are in the corp and not grouped yet', () => {
    expect(
      planAutoGroups({
        corporationId: CORP,
        accountCharacters: [mine(5), mine(6), mine(7, 99)],
        miners: [],
        declined: new Set(),
        preferredMain: 6,
      })
    ).toEqual([
      { action: 'setMiner', minerId: 'solo:6', characterIds: [5, 6], mainCharacterId: 6 },
    ]);
  });

  it('leaves a lone character, and characters already in a Miner, alone', () => {
    expect(
      planAutoGroups({
        corporationId: CORP,
        accountCharacters: [mine(5), mine(6)],
        miners: [miner('g1', [5, 8])],
        declined: new Set(),
      })
    ).toEqual([]);
  });

  it('respects characters an officer unlinked', () => {
    expect(
      planAutoGroups({
        corporationId: CORP,
        accountCharacters: [mine(5), mine(6), mine(7)],
        miners: [],
        declined: new Set([7]),
      })
    ).toEqual([
      { action: 'setMiner', minerId: 'solo:5', characterIds: [5, 6], mainCharacterId: 5 },
    ]);
  });
});
