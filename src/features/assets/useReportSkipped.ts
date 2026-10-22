import { useEffect } from 'react';

/**
 * Hands a tab's skipped Characters up to the page, so the header's one
 * Character picker can name them (`missingNames`: its warning dot and "Not
 * included" note) instead of the tab repeating them in its body (decision
 * 20261022-123837). `undefined` while nothing has loaded, and again once the
 * tab unmounts, so a stale list never outlives the tab that read it.
 * `onChange` must be stable (a state setter).
 */
export function useReportSkipped(
  names: readonly string[] | undefined,
  onChange: ((names: readonly string[] | undefined) => void) | undefined
): void {
  // A string key, so a fresh array with the same names does not re-report.
  const key = names?.join('\n');
  useEffect(() => {
    onChange?.(key === undefined ? undefined : key === '' ? [] : key.split('\n'));
  }, [key, onChange]);
  useEffect(() => () => onChange?.(undefined), [onChange]);
}
