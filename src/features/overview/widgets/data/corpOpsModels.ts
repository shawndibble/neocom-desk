import { killTotalsAcross } from '@/engine/corp/acrossCorps';
import type { CorpLabel } from '@/features/corp/corpTicker';
import { formatEntityInfo } from '@/lib/entityInfo';
import { formatNumber } from '@/lib/numberLocale';
import type { Translate } from '@/lib/translate';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { corpCell } from './cellKit';
import { corpReads, flagPartlyFailed, oldestRead } from './corpAcrossKit';
import type { CorpKillsFeed } from './corpFeeds';
import type { BuildContext, Feeds, FeedState, KindView, TableModel } from './types';

const K = 'overview.widgets.corpKills';

const infoPath = (corporationId: number) =>
  `/corp?info=${formatEntityInfo({ kind: 'corporation', id: corporationId })}`;

const efficiencyText = (iskEfficiency: number | null) =>
  iskEfficiency === null ? UNKNOWN : `${formatNumber(Math.round(iskEfficiency * 100))}%`;

interface KillsRow {
  corporationId: number;
  corp?: CorpLabel;
  stats: { kills: number; losses: number; iskEfficiency: number | null } | null;
}

function killsTable(rows: readonly KillsRow[], t: Translate): TableModel {
  const named = rows.some((row) => row.corp !== undefined);
  return {
    columns: [
      ...(named ? [{ key: 'corp', label: t(`${K}.col.corp`), priority: 0 }] : []),
      { key: 'kills', label: t(`${K}.col.kills`), align: 'end', priority: 1 },
      { key: 'losses', label: t(`${K}.col.losses`), align: 'end', priority: 2 },
      { key: 'efficiency', label: t(`${K}.col.efficiency`), align: 'end', priority: 3 },
    ],
    rows: rows.map((row) => ({
      key: String(row.corporationId),
      to: infoPath(row.corporationId),
      cells: [
        ...(named ? [row.corp ? corpCell(row.corp) : UNKNOWN] : []),
        row.stats ? formatNumber(row.stats.kills) : UNKNOWN,
        row.stats ? formatNumber(row.stats.losses) : UNKNOWN,
        row.stats ? efficiencyText(row.stats.iskEfficiency) : UNKNOWN,
      ],
    })),
  };
}

function killsAcross(feeds: Feeds, { t }: Pick<BuildContext, 't'>): KindView {
  const across = corpReads(feeds.corpKillsAll, null, t, (feed) => killsOne(feed, t));
  if ('view' in across) return across.view;
  const { reads, data } = across;
  const answered = reads.flatMap(({ feed }) => (feed.stats ? [feed.stats] : []));
  const status = statusOf(feeds.corpKillsAll, { isEmpty: answered.length === 0 });
  if (answered.length === 0) {
    const down = reads.every(({ feed }) => feed.failed !== null);
    return flagPartlyFailed(
      { ...blank(null, status), emptyMessage: t(down ? `${K}.unavailable` : `${K}.empty`) },
      data.partlyFailed
    );
  }
  const { kills, losses, iskEfficiency } = killTotalsAcross(answered);
  const efficiency = efficiencyText(iskEfficiency);
  return flagPartlyFailed(
    {
      ...blank(null, status),
      ...oldestRead(reads),
      number: {
        value: formatNumber(kills),
        unit: t(`${K}.unit`, { count: kills }),
        secondary: { text: t(`${K}.secondary`, { losses: formatNumber(losses), efficiency }) },
        notes: [t(`${K}.acrossCorps`, { count: reads.length }), t(`${K}.allTime`)],
        tone: 'clear',
      },
      table: killsTable(
        reads.map(({ corporationId, feed, label }) => ({
          corporationId,
          corp: label,
          stats: feed.stats,
        })),
        t
      ),
      summary: t(`${K}.summary`, {
        kills: formatNumber(kills),
        losses: formatNumber(losses),
        efficiency,
      }),
    },
    data.partlyFailed
  );
}

export const corpKills: Builder = (feeds, ctx) =>
  ctx.scopeAll ? killsAcross(feeds, ctx) : killsOne(feeds.corpKills, ctx.t);

function killsOne(feed: FeedState<CorpKillsFeed> | undefined, t: Translate): KindView {
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  const to = data.corporationId === null ? null : infoPath(data.corporationId);

  if (!data.readable) {
    const npc = data.corporationId !== null;
    return {
      ...blank(null, statusOf(feed, { isEmpty: true })),
      emptyMessage: t(npc ? `${K}.npc` : `${K}.unavailable`),
    };
  }
  if (data.failed !== null) {
    return {
      ...blank(to, statusOf(feed, { isEmpty: true })),
      emptyMessage: t(`${K}.unavailable`),
    };
  }
  if (data.stats === null) {
    return { ...blank(to, statusOf(feed, { isEmpty: true })), emptyMessage: t(`${K}.empty`) };
  }

  const { kills, losses, iskEfficiency } = data.stats;
  const efficiency = efficiencyText(iskEfficiency);
  return {
    ...blank(to, statusOf(feed)),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: formatNumber(kills),
      unit: t(`${K}.unit`, { count: kills }),
      secondary: { text: t(`${K}.secondary`, { losses: formatNumber(losses), efficiency }) },
      notes: [t(`${K}.allTime`)],
      tone: 'clear',
    },
    ...(data.corporationId === null
      ? {}
      : { table: killsTable([{ corporationId: data.corporationId, stats: data.stats }], t) }),
    summary: t(`${K}.summary`, {
      kills: formatNumber(kills),
      losses: formatNumber(losses),
      efficiency,
    }),
  };
}
