/**
 * The value a `CharacterFilterControl` holds: `'current'` (dynamically
 * whichever Character is active — never frozen to a specific id) on top of
 * the ordinary `MultiSelectFilter<number>` (`'all'` or a hand-picked subset).
 *
 * Every cross-character view (Wallet Balance, Industry Active Jobs) and the
 * synced default in Settings (issue #607) share this one type, so resolving
 * "current" is written once.
 */
import { useMemo } from 'react';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

export type CharacterFilterValue = 'current' | MultiSelectFilter<number>;

/**
 * `'current'` resolved against whichever Character is active right now; every
 * other value passes through unchanged.
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
  if (value !== 'current') return value;
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
 * The JSON-safe shape `CharacterFilterValue` is persisted as — a `Set` is
 * neither what Dexie should store for a `sync.`-prefixed key (structured
 * clone would work locally, but `setSyncedSetting`'s Firestore write does
 * not accept one) nor what a device restoring from JSON can trust to still
 * be a `Set` instance.
 */
export type StoredCharacterFilterValue = 'current' | 'all' | number[];

export function toStoredCharacterFilterValue(
  value: CharacterFilterValue
): StoredCharacterFilterValue {
  if (value === 'current' || value === 'all') return value;
  return [...value].sort((a, b) => a - b);
}

export function fromStoredCharacterFilterValue(
  stored: StoredCharacterFilterValue
): CharacterFilterValue {
  if (stored === 'current' || stored === 'all') return stored;
  return new Set(stored);
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
