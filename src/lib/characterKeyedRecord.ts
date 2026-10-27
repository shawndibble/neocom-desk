/**
 * Reading a stored `Record<characterId, T>` back safely.
 *
 * Several preferences are shaped this way, and for one reason: a page's data
 * is scoped to the active Character, so a single value would be overwritten by
 * whichever Character was looked at last and would silently lose every other
 * Character's. One key has to carry all of them.
 *
 * They also all want the same reading rule, which is why this is shared rather
 * than written out per store: the value is whatever was last persisted —
 * possibly by an older build, possibly hand-edited, possibly (for a synced
 * key) by another device — so a damaged entry loses only itself, never every
 * Character's memory at once.
 *
 * Distinct from `features/notifications/recordByCharacterId`, which is a type
 * guard and rejects the whole record if any entry is bad. That is the right
 * rule for a value that is written as a unit; this is the right one for a map
 * whose entries are independent.
 */

/**
 * The record with every usable entry kept and every damaged one dropped, or
 * null when the stored value is not a record at all — which is the signal
 * `createLocalSetting`/`createSyncedSetting` take to fall back to the default.
 *
 * `coerceEntry` returns the value to keep, or null to drop that Character.
 */
export function parseCharacterKeyedRecord<T>(
  raw: unknown,
  coerceEntry: (value: unknown) => T | null
): Record<number, T> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const parsed: Record<number, T> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const characterId = Number(key);
    if (!Number.isInteger(characterId)) continue;
    const entry = coerceEntry(value);
    if (entry !== null) parsed[characterId] = entry;
  }
  return parsed;
}

/**
 * A stored array, with unusable members dropped — and dropped entirely when
 * nothing survives, so "had some once" and "never had any" are one value.
 */
export function coerceArrayEntry<T>(
  value: unknown,
  isMember: (member: unknown) => member is T
): T[] | null {
  if (!Array.isArray(value)) return null;
  const kept = value.filter(isMember);
  return kept.length > 0 ? kept : null;
}
