/**
 * Which of the player's own CEO corporations they hid from "Add my other
 * corps", and which the picker has already shown them. Synced and account-wide
 * (a corporation is not a Character's). `seen` is the baseline that makes a
 * later arrival "new": the first-ever picker open records every candidate.
 */
import { useCallback } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MOONS_HIDDEN_CORPS_KEY = 'sync.moonsHiddenCorps';

export interface MoonsHiddenCorps {
  hidden: number[];
  seen: number[];
}

const EMPTY: MoonsHiddenCorps = { hidden: [], seen: [] };

const ids = (raw: unknown): number[] =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n > 0))]
    : [];

/** Anything, keeping only well-formed ids (a bad value from another build costs nothing else). */
export function parseMoonsHiddenCorps(raw: unknown): MoonsHiddenCorps {
  if (typeof raw !== 'object' || raw === null) return EMPTY;
  const r = raw as { hidden?: unknown; seen?: unknown };
  return { hidden: ids(r.hidden), seen: ids(r.seen) };
}

/**
 * Candidates that are new to the player: not hidden, not already shown to
 * them, and not already connected. Before the baseline exists (`seen` empty
 * and nothing hidden) nothing is new; the picker records it on first open.
 */
export function newCorps<T extends { corporationId: number }>(
  candidates: readonly T[],
  state: MoonsHiddenCorps & { connected?: ReadonlySet<number> | readonly number[] }
): T[] {
  if (state.seen.length === 0 && state.hidden.length === 0) return [];
  const hidden = new Set(state.hidden);
  const seen = new Set(state.seen);
  const connected = new Set(state.connected ?? []);
  return candidates.filter(
    (c) =>
      !hidden.has(c.corporationId) && !seen.has(c.corporationId) && !connected.has(c.corporationId)
  );
}

// Never deleted via deleteSyncedSetting: unhiding rewrites the arrays.
export const useMoonsHiddenCorpsStore = createSyncedSetting<MoonsHiddenCorps>({
  key: MOONS_HIDDEN_CORPS_KEY,
  defaultValue: EMPTY,
  parse: parseMoonsHiddenCorps,
});

export function withHidden(state: MoonsHiddenCorps, id: number): MoonsHiddenCorps {
  return state.hidden.includes(id) ? state : { ...state, hidden: [...state.hidden, id] };
}

export function withoutHidden(state: MoonsHiddenCorps, id: number): MoonsHiddenCorps {
  return state.hidden.includes(id)
    ? { ...state, hidden: state.hidden.filter((h) => h !== id) }
    : state;
}

export function withSeen(state: MoonsHiddenCorps, newIds: readonly number[]): MoonsHiddenCorps {
  const add = newIds.filter((id) => !state.seen.includes(id));
  return add.length === 0 ? state : { ...state, seen: [...state.seen, ...new Set(add)] };
}

export interface UseMoonsHiddenCorps extends MoonsHiddenCorps {
  hydrated: boolean;
  hide: (corporationId: number) => Promise<void>;
  unhide: (corporationId: number) => Promise<void>;
  markSeen: (corporationIds: readonly number[]) => Promise<void>;
}

export function useMoonsHiddenCorps(): UseMoonsHiddenCorps {
  const value = useMoonsHiddenCorpsStore((s) => s.value);
  const hydrated = useMoonsHiddenCorpsStore((s) => s.hydrated);
  const setValue = useMoonsHiddenCorpsStore((s) => s.setValue);
  const apply = useCallback(
    (fn: (s: MoonsHiddenCorps) => MoonsHiddenCorps) => {
      const current = useMoonsHiddenCorpsStore.getState().value;
      const next = fn(current);
      return next === current ? Promise.resolve() : setValue(next);
    },
    [setValue]
  );
  return {
    ...value,
    hydrated,
    hide: useCallback((id) => apply((s) => withHidden(s, id)), [apply]),
    unhide: useCallback((id) => apply((s) => withoutHidden(s, id)), [apply]),
    markSeen: useCallback((list) => apply((s) => withSeen(s, list)), [apply]),
  };
}
