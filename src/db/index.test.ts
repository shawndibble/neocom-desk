import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './index';

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
});

describe('neocom database', () => {
  it('is named neocom', () => {
    expect(db.name).toBe('neocom');
  });

  it('adds and gets a character by characterId', async () => {
    await db.characters.add({
      characterId: 2112625428,
      name: 'CCP Alpha',
      ownerHash: 'hash-1',
      addedAt: 1000
    });
    const c = await db.characters.get(2112625428);
    expect(c?.name).toBe('CCP Alpha');
    expect(c?.ownerHash).toBe('hash-1');
    expect(c?.addedAt).toBe(1000);
  });

  it('adds, gets, and updates a token record', async () => {
    await db.tokens.put({
      characterId: 2112625428,
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: 5000,
      scopes: ['esi-skills.read_skills.v1']
    });
    expect((await db.tokens.get(2112625428))?.refreshToken).toBe('r1');

    await db.tokens.put({
      characterId: 2112625428,
      accessToken: 'a2',
      refreshToken: 'r2',
      expiresAt: 9000,
      scopes: ['esi-skills.read_skills.v1']
    });
    const t = await db.tokens.get(2112625428);
    expect(t?.accessToken).toBe('a2');
    expect(t?.refreshToken).toBe('r2');
    expect(t?.expiresAt).toBe(9000);
    expect(await db.tokens.count()).toBe(1);
  });

  it('stores settings by key', async () => {
    await db.settings.put({ key: 'theme', value: 'dark' });
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });
});
