/**
 * Corp assets builder (issue #4671). Same contract as `models.ts`: pure,
 * derived at render time. Lines: Asset safety and Impounded (stacks + value,
 * danger), Corp deliveries waiting (stacks) and Below target (types), both
 * warning. A line at zero is left out; nothing left is the all-clear. No
 * countdown: ESI exposes no asset-safety timers.
 */
import { formatIskCompact } from '@/lib/isk';
import { blank, corpUnreadable, count, statusOf, type Builder } from './builderKit';
import { countShortTypes } from './corpAssetsSummary';
import { targetsForCorp } from '@/features/corp/stockTargets';
import type { DeadlineSeverity } from '@/engine/character/severity';
import type { TableRowModel } from './types';

const K = 'overview.widgets.corpAssets';
const ASSETS = '/corp/assets';

interface Line {
  key: 'safety' | 'impounded' | 'deliveries' | 'belowTarget';
  count: number;
  value: number | null;
  tone: DeadlineSeverity;
  to: string;
}

export const corpAssets: Builder = (feeds, { t }) => {
  const feed = feeds.corpAssets;
  const data = feed?.data ?? null;
  if (!data) return blank(ASSETS, statusOf(feed));
  if (!data.readable || data.summary === null || data.corporationId === null) {
    return corpUnreadable(ASSETS, feed, data.needsReauth, t);
  }
  const { summary } = data;
  const targets = targetsForCorp(feeds.corpStockTargets?.data ?? {}, data.corporationId);
  const below = countShortTypes(targets, summary.usableByType);

  const all: Line[] = [
    {
      key: 'safety',
      count: summary.assetSafety.stacks,
      value: summary.assetSafety.value,
      tone: 'critical',
      to: `${ASSETS}/safety`,
    },
    {
      key: 'impounded',
      count: summary.impounded.stacks,
      value: summary.impounded.value,
      tone: 'critical',
      to: `${ASSETS}/impounded`,
    },
    {
      key: 'deliveries',
      count: summary.deliveries.stacks,
      value: null,
      tone: 'warning',
      to: `${ASSETS}/deliveries`,
    },
    { key: 'belowTarget', count: below, value: null, tone: 'warning', to: `${ASSETS}?below=1` },
  ];
  const lines = all.filter((line) => line.count > 0);
  const nothingHeld = summary.totalStacks === 0 && targets.size === 0;
  const countText = (line: Line) => t(`${K}.${line.key}Count`, { count: line.count });

  const tone: DeadlineSeverity = lines.some((l) => l.tone === 'critical')
    ? 'critical'
    : lines.length > 0
      ? 'warning'
      : 'clear';
  const rows: TableRowModel[] = lines.map((line) => ({
    key: line.key,
    tone: line.tone,
    to: line.to,
    cells: [
      t(`${K}.line.${line.key}`),
      countText(line),
      line.value === null ? '' : { text: formatIskCompact(line.value), iskAmount: line.value },
    ],
  }));

  return {
    ...blank(ASSETS, statusOf(feed, { isEmpty: lines.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    emptyMessage: lines.length === 0 ? t(nothingHeld ? `${K}.empty` : `${K}.allClear`) : undefined,
    number: {
      value: count(lines.length),
      unit: t(`${K}.unit`, { count: lines.length }),
      secondary: data.truncated ? { text: t(`${K}.truncated`) } : undefined,
      tone,
    },
    rows: lines.map((line) => ({
      key: line.key,
      title: t(`${K}.line.${line.key}`),
      detail: line.value === null ? undefined : formatIskCompact(line.value),
      value: countText(line),
      tone: line.tone,
      to: line.to,
    })),
    table: {
      columns: [
        { key: 'line', label: t(`${K}.col.line`), priority: 0 },
        { key: 'count', label: t(`${K}.col.count`), align: 'end', priority: 1 },
        { key: 'value', label: t(`${K}.col.value`), align: 'end', priority: 2, hideNarrow: true },
      ],
      rows,
    },
    summary:
      lines.length === 0
        ? t(`${K}.summaryClear`)
        : t(`${K}.summary`, {
            safety: summary.assetSafety.stacks,
            impounded: summary.impounded.stacks,
            deliveries: summary.deliveries.stacks,
            below,
          }),
  };
};
