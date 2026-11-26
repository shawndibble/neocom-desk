import { captureException } from '@sentry/react';
import { create } from 'zustand';
import { db, type SettingRecord } from '@/db';

export const ACTIVE_CHARACTER_KEY = 'activeCharacterId';

interface ActiveCharacterState {
  activeCharacterId: number | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveCharacter: (characterId: number) => Promise<void>;
  clearActiveCharacter: () => Promise<void>;
}

export const useActiveCharacter = create<ActiveCharacterState>((set) => ({
  activeCharacterId: null,
  hydrated: false,
  hydrate: async () => {
    let record: SettingRecord | undefined;
    try {
      record = await db.settings.get(ACTIVE_CHARACTER_KEY);
    } catch (error) {
      captureException(error);
      record = undefined;
    }
    set({
      activeCharacterId: typeof record?.value === 'number' ? record.value : null,
      hydrated: true,
    });
  },
  setActiveCharacter: async (characterId) => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: characterId });
    set({ activeCharacterId: characterId, hydrated: true });
  },
  clearActiveCharacter: async () => {
    await db.settings.delete(ACTIVE_CHARACTER_KEY);
    set({ activeCharacterId: null, hydrated: true });
  },
}));
