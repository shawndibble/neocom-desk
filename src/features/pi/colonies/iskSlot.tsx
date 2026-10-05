import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { IskAmount } from '@/components/ui';

const SLOT = '\u0001';

/**
 * A translated sentence with one ISK figure rendered as `IskAmount` (shorthand,
 * exact on hover/focus/screen reader) instead of a bare `formatIskCompact` string.
 * The string uses `{{gain}}` where the figure goes; whole-ISK precision, since
 * PI figures are price-based estimates.
 */
export function tWithIsk(
  t: TFunction,
  key: string,
  options: Record<string, unknown>,
  value: number
): ReactNode {
  const text = t(key, { ...options, gain: SLOT }) as string;
  const at = text.indexOf(SLOT);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <IskAmount value={value} decimals={0} />
      {text.slice(at + 1)}
    </>
  );
}
