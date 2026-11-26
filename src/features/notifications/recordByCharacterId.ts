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
