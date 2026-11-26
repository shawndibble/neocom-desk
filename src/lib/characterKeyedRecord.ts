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

export function coerceArrayEntry<T>(
  value: unknown,
  isMember: (member: unknown) => member is T
): T[] | null {
  if (!Array.isArray(value)) return null;
  const kept = value.filter(isMember);
  return kept.length > 0 ? kept : null;
}
