/**
 * Corp assets builder (issue #4671). Same contract as `models.ts`: pure,
 * derived at render time. Lines: Asset safety and Impounded (stacks + value,
 * danger), Corp deliveries waiting (stacks) and Below target (types), both
 * warning. A line at zero is left out; nothing left is the all-clear. No
 * countdown: ESI exposes no asset-safety timers.
 */
import { formatIskCompact } from '@/lib/isk';
import { blank, corpUnreadable, count, statusOf, type Builder } from './builderKit';
import { countShortTypes, type CorpAssetsSummary } from './corpAssetsSummary';
import { targetsForCorp } from '@/features/corp/stockTargets';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { corpReads, flagPartlyFailed, oldestRead } from './corpAcrossKit';
import type { KindView, TableRowModel } from './types';
import type { WidgetStateInput } from '../state';
import type { Translate } from '@/lib/translate';

const K = 'overview.widgets.corpAssets';
const ASSETS = '/corp/assets';

/** A stack worth 0 ISK is one the price list doesn't know, so it prints like an unpriced one rather than "0". */
function pricedValue(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

interface Line {
  key: 'safety' | 'impounded' | 'deliveries' | 'belowTarget';
  count: number;
  value: number | null;
  tone: DeadlineSeverity;
  to: string;
}

/** The four lines for one corporation's summary, `below` counting the types short of its own targets. */
function linesFor(summary: CorpAssetsSummary, below: number): Line[] {
  return [
    {
      key: 'safety',
      count: summary.assetSafety.stacks,
      value: pricedValue(summary.assetSafety.value),
      tone: 'critical',
      to: `${ASSETS}/safety`,
    },
    {
      key: 'impounded',
      count: summary.impounded.stacks,
      value: pricedValue(summary.impounded.value),
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
}

/** Each line summed over the corporations: a value stays unknown only when none of them priced it. */
function sumLines(perCorporation: readonly Line[][]): Line[] {
  return perCorporation[0]!.map((line, i) => {
    const values = perCorporation.flatMap((lines) => {
      const value = lines[i]!.value;
      return value === null ? [] : [value];
    });
    return {
      ...line,
      count: perCorporation.reduce((sum, lines) => sum + lines[i]!.count, 0),
      value: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0),
    };
  });
}

interface AssetsRead {
  fetchedAt: Date | null;
  fromCache: boolean;
  truncated: boolean;
  /** Nothing held and no target set: "no assets", not an all-clear. */
  nothingHeld: boolean;
}

function assetsView(
  t: Translate,
  status: WidgetStateInput,
  all: readonly Line[],
  read: AssetsRead
): KindView {
  const lines = all.filter((line) => line.count > 0);
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
    ...blank(ASSETS, { ...status, isEmpty: lines.length === 0 }),
    fetchedAt: read.fetchedAt,
    fromCache: read.fromCache,
    emptyMessage:
      lines.length === 0 ? t(read.nothingHeld ? `${K}.empty` : `${K}.allClear`) : undefined,
    number: {
      value: count(lines.length),
      unit: t(`${K}.unit`, { count: lines.length }),
      secondary: read.truncated ? { text: t(`${K}.truncated`) } : undefined,
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
            parts: lines
              .map((line) => `${t(`${K}.line.${line.key}`)}: ${countText(line)}`)
              .join(', '),
          }),
  };
}

export const corpAssets: Builder = (feeds, { t }) => {
  const feed = feeds.corpAssets;
  const data = feed?.data ?? null;
  if (!data) return blank(ASSETS, statusOf(feed));
  if (!data.readable || data.summary === null || data.corporationId === null) {
    return corpUnreadable(ASSETS, feed, data.needsReauth, t);
  }
  // Targets decide the Below target line and the all-clear: until they are hydrated, say nothing.
  const targetFeed = feeds.corpStockTargets;
  if (!targetFeed?.data) return blank(ASSETS, statusOf(targetFeed));
  const { summary } = data;
  const targets = targetsForCorp(targetFeed.data, data.corporationId);
  const below = countShortTypes(targets, summary.usableByType);
  return assetsView(t, statusOf(feed), linesFor(summary, below), {
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    truncated: data.truncated,
    nothingHeld: summary.totalStacks === 0 && targets.size === 0,
  });
};

/**
 * The same four lines summed over every corporation read, so an asset safety clock or an impound
 * in any of them lights the widget. Below target is each corporation's own against its own
 * targets, since a stack in one corporation's hangar cannot cover another's shortfall.
 */
export const corpAssetsAcross: Builder = (feeds, ctx) => {
  const { t } = ctx;
  const feed = feeds.corpAssetsAll;
  const targetFeed = feeds.corpStockTargets;
  const reads = corpReads(feed, ASSETS, t, (state) =>
    corpAssets({ ...feeds, corpAssets: state }, ctx)
  );
  if ('view' in reads) return reads.view;
  if (!targetFeed?.data) return blank(ASSETS, statusOf(targetFeed));
  const targetData = targetFeed.data;
  const held = reads.reads.flatMap(({ feed: read }) =>
    read.summary === null || read.corporationId === null
      ? []
      : [{ read, summary: read.summary, targets: targetsForCorp(targetData, read.corporationId) }]
  );
  // Every read readable yet none with a summary is a read that landed nothing: never an all-clear.
  if (held.length === 0) return corpUnreadable(ASSETS, feed, false, t);
  const lines = sumLines(
    held.map(({ summary, targets }) =>
      linesFor(summary, countShortTypes(targets, summary.usableByType))
    )
  );
  const { fetchedAt, fromCache } = oldestRead(reads.reads);
  return flagPartlyFailed(
    assetsView(t, statusOf(feed), lines, {
      fetchedAt,
      fromCache,
      truncated: held.some(({ read }) => read.truncated),
      nothingHeld: held.every(
        ({ summary, targets }) => summary.totalStacks === 0 && targets.size === 0
      ),
    }),
    reads.data.partlyFailed
  );
};
