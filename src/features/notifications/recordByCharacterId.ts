/**
 * "A record keyed by numeric character id, each value validated by X" is the
 * shape `preferences.ts` (`isPerCharacterMap`, `isEveNotificationTypesByCharacter`,
 * `isThresholdsByCharacter`) and `syncedPreferences.ts` (`isBooleanMapByCharacter`,
 * its own `isThresholdsByCharacter`) each hand-rolled the same outer loop for —
 * this factory is that shape's one implementation. Lives in its own module
 * rather than either of theirs: `preferences.ts` already imports real
 * (value) bindings from `syncedPreferences.ts`, so putting this factory in
 * `syncedPreferences.ts` and importing it back from `preferences.ts` would
 * be a circular import; a third module both can depend on avoids it.
 */
export function recordByCharacterId<T>(
  isValue: (raw: unknown) => raw is T
): (raw: unknown) => raw is Record<number, T> {
  return (raw: unknown): raw is Record<number, T> => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
    return Object.entries(raw as Record<string, unknown>).every(
      ([key, value]) => !Number.isNaN(Number(key)) && isValue(value)
    );
  };
}
