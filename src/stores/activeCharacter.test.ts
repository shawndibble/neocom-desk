import { describe, it, expect, beforeEach } from 'vitest';
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
