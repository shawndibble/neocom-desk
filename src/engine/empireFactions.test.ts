import { describe, expect, it } from 'vitest';
import { EMPIRE_FACTION_IDS, empireFactionOf } from './empireFactions';

describe('empireFactionOf', () => {
  it('names each empire faction by its id', () => {
    for (const [faction, id] of Object.entries(EMPIRE_FACTION_IDS)) {
      expect(empireFactionOf(id)).toBe(faction);
    }
  });

  it('is null for a pirate or unknown faction, and for none', () => {
    expect(empireFactionOf(500010)).toBeNull();
    expect(empireFactionOf(null)).toBeNull();
    expect(empireFactionOf(undefined)).toBeNull();
  });
});
