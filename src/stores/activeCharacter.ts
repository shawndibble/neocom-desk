// Active character selection, persisted in Dexie settings so it survives reloads.
import { captureException } from '@sentry/react';
import { create } from 'zustand';
import { db, type SettingRecord } from '@/db';

export const ACTIVE_CHARACTER_KEY = 'activeCharacterId';

interface ActiveCharacterState {
  activeCharacterId: number | null;
  /** True once the Dexie setting has been read (or written) at least once. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveCharacter: (characterId: number) => Promise<void>;
  /** Drop the active selection — used when the active Character is removed and no other exists to fall back to. */
  clearActiveCharacter: () => Promise<void>;
}

export const useActiveCharacter = create<ActiveCharacterState>((set) => ({
  activeCharacterId: null,
  hydrated: false,
  hydrate: async () => {
    // `hydrated` must end true on every path, including failure: the Root gate
    // renders BootScreen until it flips, and a rejected read throws nothing
    // into render, so ErrorBoundary never sees it. No active character is the
    // safe fallback — nothing is written back, so a stored selection survives,
    // and the Login and character gates already handle "none picked".
    let record: SettingRecord | undefined;
    try {
      record = await db.settings.get(ACTIVE_CHARACTER_KEY);
    } catch (error) {
      // Reported, not swallowed — a forced re-pick is this failure's only
      // user-visible symptom.
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
