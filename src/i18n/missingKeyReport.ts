export function createMissingKeyHandler(
  report: (key: string) => void
): (
  lngs: readonly string[],
  ns: string,
  key: string,
  fallbackValue: string,
  updateMissing: boolean,
  options: { defaultValue?: unknown }
) => void {
  const seen = new Set<string>();
  return (_lngs, _ns, key, _fallback, _update, options) => {
    if (options?.defaultValue !== undefined || seen.has(key)) return;
    seen.add(key);
    report(key);
  };
}
