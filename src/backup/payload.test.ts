import { describe, it, expect } from 'vitest';
import { partitionImport, type BackupPayload } from './payload';
import type { CharacterRecord, TokenRecord } from '@/db';

const character = (id: number): CharacterRecord => ({
  characterId: id,
  name: `Char ${id}`,
  ownerHash: `hash-${id}`,
  addedAt: 0,
});

const token = (id: number): TokenRecord => ({
  characterId: id,
  accessToken: `access-${id}`,
  refreshToken: `refresh-${id}`,
  expiresAt: 0,
  scopes: [],
});

describe('partitionImport', () => {
  it('skips a character already present locally, leaving its token untouched', () => {
    const payload: BackupPayload = {
      characters: [character(1)],
      tokens: [token(1)],
      editableTables: { skillPlans: [{ characterId: 1, id: 'p1' }] },
      settings: [],
    };

    const result = partitionImport(payload, new Set([1]), new Set());

    expect(result.skippedCharacterIds).toEqual([1]);
    expect(result.toWrite.characters).toEqual([]);
    expect(result.toWrite.tokens).toEqual([]);
    expect(result.toWrite.editableTables.skillPlans).toEqual([]);
  });

  it("writes a new character's full bundle", () => {
    const payload: BackupPayload = {
      characters: [character(2)],
      tokens: [token(2)],
      editableTables: { skillPlans: [{ characterId: 2, id: 'p2' }] },
      settings: [],
    };

    const result = partitionImport(payload, new Set([1]), new Set());

    expect(result.skippedCharacterIds).toEqual([]);
    expect(result.toWrite.characters).toEqual([character(2)]);
    expect(result.toWrite.tokens).toEqual([token(2)]);
    expect(result.toWrite.editableTables.skillPlans).toEqual([{ characterId: 2, id: 'p2' }]);
  });

  it('does not overwrite a sync.-prefixed setting already present locally', () => {
    const payload: BackupPayload = {
      characters: [],
      tokens: [],
      editableTables: {},
      settings: [
        { key: 'sync.marketHub', value: 'imported-hub' },
        { key: 'sync.piCustomsRates', value: { 1: 0.1 } },
      ],
    };

    const result = partitionImport(payload, new Set(), new Set(['sync.marketHub']));

    expect(result.skippedSettingKeys).toEqual(['sync.marketHub']);
    expect(result.toWrite.settings).toEqual([{ key: 'sync.piCustomsRates', value: { 1: 0.1 } }]);
  });

  it('handles a mix of new and existing characters independently', () => {
    const payload: BackupPayload = {
      characters: [character(1), character(2), character(3)],
      tokens: [token(1), token(2), token(3)],
      editableTables: {
        buildPlans: [
          { characterId: 1, id: 'b1' },
          { characterId: 2, id: 'b2' },
          { characterId: 3, id: 'b3' },
        ],
      },
      settings: [],
    };

    const result = partitionImport(payload, new Set([1, 3]), new Set());

    expect(result.skippedCharacterIds.sort()).toEqual([1, 3]);
    expect(result.toWrite.characters).toEqual([character(2)]);
    expect(result.toWrite.tokens).toEqual([token(2)]);
    expect(result.toWrite.editableTables.buildPlans).toEqual([{ characterId: 2, id: 'b2' }]);
  });
});
