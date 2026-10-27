/**
 * The value a `CharacterFilterControl` holds: `'current'` (dynamically
 * whichever Character is active — never frozen to a specific id) or `'all'`.
 *
 * Used to hold a third case too — a hand-picked subset of specific
 * characters — but every caller's actual use of that turned out to be either
 * "current" or "all" wearing a `Set` costume; nothing in the product named a
 * genuine partial subset as a feature (see the scope decision narrowing this
 * to two states). `resolveCharacterFilter` still returns the richer
 * `MultiSelectFilter<number>` shape below, because "current" resolves to a
 * one-member `Set` for the data-loading code that was never part of what got
 * narrowed — only the *value a picker can express* did.
 *
 * Every cross-character view (Wallet Balance, Industry Active Jobs) and the
 * synced default in Settings (issue #607) share this one type, so resolving
 * "current" is written once.
 */
import { useMemo } from 'react';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

export type CharacterFilterValue = 'current' | 'all';

/**
 * `'current'` resolved against whichever Character is active right now; `'all'`
 * passes through unchanged. Returns the richer `MultiSelectFilter<number>`
 * shape (`'all'` or a `Set`) that every cross-character data loader already
 * expects — `'current'` becomes a one-member `Set`, not a bare id, so a
 * loader written for "some set of characters" never needs a separate branch
 * for "exactly one."
 *
 * For the `'current'` case this allocates a **fresh `Set` on every call** —
 * fine for a one-off read (an event handler, a single render-time
 * comparison), but that fresh identity is exactly what turned into an
 * infinite render loop (issue #675, React error #185, commit `c39a9e7`) the
 * one time a caller let it reach a `useEffect`/`useMemo` dependency array
 * without memoizing it first. Any render-time caller — anything that will
 * feed the result into a hook dependency array — must use
 * `useResolvedCharacterFilter` instead of calling this directly.
 */
export function resolveCharacterFilter(
  value: CharacterFilterValue,
  activeCharacterId: number | null
): MultiSelectFilter<number> {
  if (value === 'all') return 'all';
  return activeCharacterId === null ? 'all' : new Set([activeCharacterId]);
}

/**
 * The render-safe form of `resolveCharacterFilter`: memoized so the result is
 * referentially stable across re-renders with unchanged inputs, safe to drop
 * straight into a `useMemo`/`useEffect` dependency array. This is the seam
 * that owns the stability guarantee — every component deriving a resolved
 * filter at render time should call this instead of the raw function plus its
 * own ad hoc `useMemo` (see issue #675 for what happens when a call site
 * forgets to).
 */
export function useResolvedCharacterFilter(
  value: CharacterFilterValue,
  activeCharacterId: number | null
): MultiSelectFilter<number> {
  return useMemo(
    () => resolveCharacterFilter(value, activeCharacterId),
    [value, activeCharacterId]
  );
}

/**
 * The JSON-safe shape `CharacterFilterValue` is persisted as. `number[]`
 * is accepted here only as a *legacy* shape: an older client could still be
 * writing one for a while after this rollout (a synced `sync.`-prefixed
 * Firestore value, in particular, is shared across every device on the
 * account, not just the one that upgraded first). Nothing here writes an
 * array any more — `toStoredCharacterFilterValue` only ever produces
 * `'current'` or `'all'` — but the read path still has to make sense of one.
 */
export type StoredCharacterFilterValue = 'current' | 'all' | number[];

export function toStoredCharacterFilterValue(
  value: CharacterFilterValue
): StoredCharacterFilterValue {
  return value;
}

/**
 * A legacy `number[]` (a hand-picked subset, from before this value was
 * narrowed to `'current' | 'all'`) becomes `'all'`, not `'current'` — the
 * active Character differs per device, so there is no single id in the array
 * that every device reading this value could safely collapse to.
 */
export function fromStoredCharacterFilterValue(
  stored: StoredCharacterFilterValue
): CharacterFilterValue {
  return stored === 'current' ? 'current' : Array.isArray(stored) ? 'all' : stored;
}

export function isStoredCharacterFilterValue(raw: unknown): raw is StoredCharacterFilterValue {
  if (raw === 'current' || raw === 'all') return true;
  // A character id is always a positive integer (ESI's own id space) —
  // rejecting anything else here is what stops a corrupted or hand-edited
  // synced row from resolving to a Set holding 0, a negative, NaN, or a
  // fractional value, which would silently never match a real Character.
  return (
    Array.isArray(raw) &&
    raw.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
  );
}
