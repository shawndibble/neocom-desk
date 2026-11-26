import { create } from 'zustand';

export interface CharacterSpSummary {
  totalSp: number | null;
  unallocatedSp: number | null;
}

export const NO_SP_SUMMARY: CharacterSpSummary = { totalSp: null, unallocatedSp: null };

interface CharacterSpState {
  byCharacterId: Record<number, CharacterSpSummary>;
}

const useCharacterSp = create<CharacterSpState>(() => ({ byCharacterId: {} }));

export function getLastKnownSpSummary(characterId: number | null): CharacterSpSummary {
  if (characterId === null) return NO_SP_SUMMARY;
  return useCharacterSp.getState().byCharacterId[characterId] ?? NO_SP_SUMMARY;
}

export function rememberSpSummary(
  characterId: number,
  summary: CharacterSpSummary
): CharacterSpSummary {
  if (summary.totalSp !== null || summary.unallocatedSp !== null) {
    useCharacterSp.setState((state) => ({
      byCharacterId: { ...state.byCharacterId, [characterId]: summary },
    }));
  }
  return summary;
}
