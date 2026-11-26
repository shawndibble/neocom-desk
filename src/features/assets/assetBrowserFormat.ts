import { formatIsk } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

export function formatBadge(
  totals: { itemCount: number; estimatedValue: number },
  t: Translate
): string {
  return t('assets.nodeBadge', {
    count: totals.itemCount,
    value: formatIsk(totals.estimatedValue),
  });
}

export function hasItemRows(rows: readonly { kind: string; node?: { kind: string } }[]): boolean {
  return rows.some((r) => r.kind === 'node' && r.node?.kind === 'item');
}
