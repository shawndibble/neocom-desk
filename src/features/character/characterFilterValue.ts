/**
 * The value a `CharacterFilterControl` holds: `'current'` (dynamically
 * whichever Character is active — never frozen to a specific id) on top of
 * the ordinary `MultiSelectFilter<number>` (`'all'` or a hand-picked subset).
 *
 * Every cross-character view (Wallet Balance, Industry Active Jobs) and the
 * synced default in Settings (issue #607) share this one type, so resolving
 * "current" is written once.
 */
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

export type CharacterFilterValue = 'current' | MultiSelectFilter<number>;

/** `'current'` resolved against whichever Character is active right now; every other value passes through unchanged. */
export function resolveCharacterFilter(
  value: CharacterFilterValue,
  activeCharacterId: number | null
): MultiSelectFilter<number> {
  if (value !== 'current') return value;
  return activeCharacterId === null ? 'all' : new Set([activeCharacterId]);
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
