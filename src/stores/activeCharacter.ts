// Active character selection, persisted in Dexie settings so it survives reloads.
import { create } from 'zustand';
import { db } from '@/db';

export const ACTIVE_CHARACTER_KEY = 'activeCharacterId';

interface ActiveCharacterState {
  activeCharacterId: number | null;
  /** True once the Dexie setting has been read (or written) at least once. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveCharacter: (characterId: number) => Promise<void>;
}

export const useActiveCharacter = create<ActiveCharacterState>((set) => ({
  activeCharacterId: null,
  hydrated: false,
  hydrate: async () => {
    const record = await db.settings.get(ACTIVE_CHARACTER_KEY);
    set({
      activeCharacterId: typeof record?.value === 'number' ? record.value : null,
      hydrated: true,
    });
  },
  setActiveCharacter: async (characterId) => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: characterId });
    set({ activeCharacterId: characterId, hydrated: true });
  },
}));
