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

/** Whether a level has any item row — the label strip has nothing to name otherwise. */
export function hasItemRows(rows: readonly { kind: string; node?: { kind: string } }[]): boolean {
  return rows.some((r) => r.kind === 'node' && r.node?.kind === 'item');
}
