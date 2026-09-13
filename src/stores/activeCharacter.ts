// Active character selection, persisted in Dexie settings so it survives reloads.
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
    // `hydrated` must end true on every path, including failure. `App.tsx`'s
    // Root gate renders BootScreen until it flips, and a rejected read here
    // throws nothing into render — so ErrorBoundary never sees it and the app
    // would sit on the spinner forever. That is one of the ways an Android
    // install ends up stuck on the loading screen with no way out but a
    // reinstall. No active character is the safe answer: the Login and
    // character gates already handle "none picked".
    let record: SettingRecord | undefined;
    try {
      record = await db.settings.get(ACTIVE_CHARACTER_KEY);
    } catch {
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
