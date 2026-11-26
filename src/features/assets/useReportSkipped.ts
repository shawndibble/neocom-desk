import { useEffect } from 'react';

export function useReportSkipped(
  names: readonly string[] | undefined,
  onChange: ((names: readonly string[] | undefined) => void) | undefined
): void {
  const key = names?.join('\n');
  useEffect(() => {
    onChange?.(key === undefined ? undefined : key === '' ? [] : key.split('\n'));
  }, [key, onChange]);
  useEffect(() => () => onChange?.(undefined), [onChange]);
}
