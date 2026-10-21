/**
 * Corp operations builders: Corp kills. Same contract as `models.ts`: pure,
 * derived at render time. The totals are zKillboard's all-time figures (the
 * stats call has no date range), so the widget is a Number, labelled "all time".
 */
import { formatNumber } from '@/lib/numberLocale';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';

const K = 'overview.widgets.corpKills';

/** The Public info modal's Corporation tab, over the current page (`/corp`). */
const infoPath = (corporationId: number) => `/corp?info=corporation-${corporationId}`;

export const corpKills: Builder = (feeds, { t }) => {
  const feed = feeds.corpKills;
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
  // zKillboard being down is a note, never an error (the modal does the same).
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
  const efficiency =
    iskEfficiency === null ? UNKNOWN : `${formatNumber(Math.round(iskEfficiency * 100))}%`;
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
    summary: t(`${K}.summary`, {
      kills: formatNumber(kills),
      losses: formatNumber(losses),
      efficiency,
    }),
  };
};
