import { describe, expect, it } from 'vitest';
import { isNpcCharacterId, isNpcCorporationId } from './entityIds';

describe('isNpcCharacterId', () => {
  it('is true across CCP’s NPC-character block (agents and NPC CEOs)', () => {
    expect(isNpcCharacterId(3_000_000)).toBe(true);
    expect(isNpcCharacterId(3_008_416)).toBe(true);
    expect(isNpcCharacterId(3_999_999)).toBe(true);
  });

  it('is false just outside the block and for player characters', () => {
    expect(isNpcCharacterId(2_999_999)).toBe(false);
    expect(isNpcCharacterId(4_000_000)).toBe(false);
    expect(isNpcCharacterId(90_000_001)).toBe(false);
    expect(isNpcCharacterId(2_112_345_678)).toBe(false);
  });
});

describe('isNpcCorporationId', () => {
  it('is true across CCP’s NPC-corporation block', () => {
    expect(isNpcCorporationId(1_000_000)).toBe(true);
    expect(isNpcCorporationId(1_000_125)).toBe(true);
    expect(isNpcCorporationId(1_999_999)).toBe(true);
  });

  it('is false just outside the block and for player corporations', () => {
    expect(isNpcCorporationId(999_999)).toBe(false);
    expect(isNpcCorporationId(2_000_000)).toBe(false);
    expect(isNpcCorporationId(98_000_001)).toBe(false);
    expect(isNpcCorporationId(500_001)).toBe(false);
  });
});
