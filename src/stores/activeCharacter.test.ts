import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter, ACTIVE_CHARACTER_KEY } from './activeCharacter';

beforeEach(async () => {
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
});

describe('useActiveCharacter', () => {
  it('hydrates from the Dexie setting', async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 42 });
    await useActiveCharacter.getState().hydrate();
    expect(useActiveCharacter.getState().activeCharacterId).toBe(42);
    expect(useActiveCharacter.getState().hydrated).toBe(true);
  });

  it('hydrates to null when no setting exists', async () => {
    await useActiveCharacter.getState().hydrate();
    expect(useActiveCharacter.getState().activeCharacterId).toBeNull();
    expect(useActiveCharacter.getState().hydrated).toBe(true);
  });

  it('setActiveCharacter persists to Dexie and updates state', async () => {
    await useActiveCharacter.getState().setActiveCharacter(99);
    expect(useActiveCharacter.getState().activeCharacterId).toBe(99);
    const record = await db.settings.get(ACTIVE_CHARACTER_KEY);
    expect(record?.value).toBe(99);
  });
});

describe('useActiveCharacter hydrate failure', () => {
  it('still marks itself hydrated when the Dexie read rejects', async () => {
    const get = vi.spyOn(db.settings, 'get').mockRejectedValue(new Error('db unavailable'));
    try {
      await useActiveCharacter.getState().hydrate();
    } finally {
      get.mockRestore();
    }
    // A failed read must not be able to pin the app on BootScreen forever
    // (App.tsx's Root gate waits on `hydrated`). No character is the right
    // answer here; the Login/character gates take it from there.
    expect(useActiveCharacter.getState().hydrated).toBe(true);
    expect(useActiveCharacter.getState().activeCharacterId).toBeNull();
  });
});
