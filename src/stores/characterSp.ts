// Session cache of the last-known SP pair per character, mirroring
// `publicInfo.ts`'s shape. Every Character-overview tab (Overview, Clones,
// Employment History) loads its own SP data independently — see
// `features/character/characterSp.ts` — so switching between them used to
// blank the shared header to "—" on every switch, however briefly, even
// though another tab had already loaded the very same character's SP
// moments earlier. This store lets a freshly-mounted tab seed the header
// from whichever tab found real numbers last, while each tab's own load
// stays the source of truth for itself.
import { create } from 'zustand';

export interface CharacterSpSummary {
  /** total_sp corrected for queue levels /skills has not caught up to; null when unavailable. */
  totalSp: number | null;
  /** ESI's unallocated_sp; null when unavailable — not granted, not fetched, or absent from the payload. */
  unallocatedSp: number | null;
}

/** Stable identity for "nothing to show", so a caller can default to it without allocating. */
export const NO_SP_SUMMARY: CharacterSpSummary = { totalSp: null, unallocatedSp: null };

interface CharacterSpState {
  byCharacterId: Record<number, CharacterSpSummary>;
}

const useCharacterSp = create<CharacterSpState>(() => ({ byCharacterId: {} }));

/** Last successfully-observed SP pair for a character, from any tab that has loaded it. */
export function getLastKnownSpSummary(characterId: number | null): CharacterSpSummary {
  if (characterId === null) return NO_SP_SUMMARY;
  return useCharacterSp.getState().byCharacterId[characterId] ?? NO_SP_SUMMARY;
}

/**
 * Records a freshly-loaded SP pair for `getLastKnownSpSummary` to serve to
 * the next tab that mounts. An all-null summary is not remembered — a
 * legitimate "no scope"/"unreachable" read from one tab must not blank out
 * a real value another tab already found.
 */
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
