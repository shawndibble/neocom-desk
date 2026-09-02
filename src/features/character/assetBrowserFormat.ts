import { formatIsk } from '@/lib/isk';

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** "N items · V ISK" — one string, so a row's metadata is one DOM text node rather than several. */
export function formatBadge(
  totals: { itemCount: number; estimatedValue: number },
  t: Translate
): string {
  return t('assets.nodeBadge', {
    count: totals.itemCount,
    value: formatIsk(totals.estimatedValue),
  });
}
