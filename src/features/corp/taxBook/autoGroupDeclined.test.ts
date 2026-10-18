import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { declineAutoGroup, declinedCharacterIds } from './autoGroupDeclined';

describe('autoGroupDeclined', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('remembers an unlinked character per corporation', async () => {
    expect((await declinedCharacterIds(1)).size).toBe(0);
    await declineAutoGroup(1, 7);
    await declineAutoGroup(1, 8);
    await declineAutoGroup(2, 9);
    expect([...(await declinedCharacterIds(1))].sort()).toEqual([7, 8]);
    expect([...(await declinedCharacterIds(2))]).toEqual([9]);
  });
});
