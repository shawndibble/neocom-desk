/**
 * Production-only report of a translation key i18next could not find
 * (`saveMissing` in `./index.ts`). With the build-time locale split
 * (`localeSplit.ts`) a key can go missing at runtime in a way no test sees —
 * a key whose literal lives in a chunk that has not loaded, rendered from a
 * stored string — so it is worth one Sentry message per key per session.
 *
 * A lookup that passes its own `defaultValue` is left alone: those keys are
 * allowed to be absent (e.g. an EVE type name with no copy of its own).
 */
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
