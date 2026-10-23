/**
 * Skyhook raids (issue #4798), the member tier of the sov widgets: skyhooks in
 * the Character's alliance space raidable now or soon, public data only. Pure,
 * derived at render time. The role tier is the Corp Board's `corpSovereignty`.
 *
 * Copy lives in the lazy `travel.sovRaids` section: the shell locale has no room
 * (`localeSplit.test.ts`). Only title, description and empty line stay under
 * `overview.widgets`.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { liveRaids, raidState } from '@/engine/corp/sovereignty';
import { formatCountdown } from '@/lib/duration';
import type { BoardDeadline } from '../nextDeadline';
import { ageText, blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { SovRaidSkyhook, SovRaidsWidgetData } from './sovRaidsLoader';
import type { Feeds, KindView, TableRowModel } from './types';

const TO = '/travel/route';

/** No alliance, or an alliance holding no sov: the empty state with its reason, never a lock. */
function nothingToDefend(
  feed: Feeds['sovRaids'],
  data: SovRaidsWidgetData,
  emptyMessage: string
): KindView {
  return {
    ...blank(TO, statusOf(feed, { isEmpty: true })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    emptyMessage,
  };
}

export const sovRaids: Builder = (feeds, { t, now }) => {
  const feed = feeds.sovRaids;
  const data = feed?.data ?? null;
  if (!data) return blank(TO, statusOf(feed));
  if (data.alliance === null) {
    return nothingToDefend(feed, data, t('travel.sovRaids.noAlliance'));
  }
  if (!data.holdsSov) return nothingToDefend(feed, data, t('travel.sovRaids.noSov'));

  // Never claims more precision than the read: under its window reads "under 10m".
  const until = (remainingMs: number): string =>
    remainingMs < data.freshForMs
      ? t('travel.sovRaids.underCacheWindow', {
          duration: formatCountdown(data.freshForMs / 1000),
        })
      : formatCountdown(remainingMs / 1000);

  const live = liveRaids(data.skyhooks, now);
  // Listed as raidable but with no readable window: unknown, never safe, so kept, last.
  const unread = data.skyhooks
    .filter((hook) => hook.window === null)
    .sort((a, b) => a.key.localeCompare(b.key));

  const views = [...live, ...unread].map((hook: SovRaidSkyhook) => {
    const { window } = hook;
    const open = window !== null && raidState(window, now) === 'open';
    // Open: the raid can happen now. Upcoming or unknown: the list only reaches a few hours ahead.
    const tone: DeadlineSeverity = open ? 'critical' : 'warning';
    const name = hook.planetName ?? data.systemNames.get(hook.systemId) ?? UNKNOWN;
    let text = UNKNOWN;
    let fact = UNKNOWN;
    if (window !== null) {
      const closes = until(window.endMs - now);
      const opens = until(window.startMs - now);
      text = open
        ? t('travel.sovRaids.windowOpen', { duration: closes })
        : t('travel.sovRaids.windowIn', { duration: opens });
      fact = open
        ? t('travel.sovRaids.fact.openNow', { closes })
        : t('travel.sovRaids.fact.upcoming', { opens, closes });
    }
    return { hook, open, tone, name, text, fact, jumps: data.jumps.get(hook.systemId) };
  });

  const soonest = views[0];
  const secondary =
    soonest === undefined || soonest.hook.window === null
      ? undefined
      : {
          text: [
            soonest.open
              ? t('travel.sovRaids.nextOpenNow', { subject: soonest.name })
              : t('travel.sovRaids.nextOpensIn', {
                  subject: soonest.name,
                  duration: until(soonest.hook.window.startMs - now),
                }),
            ...(soonest.jumps === undefined
              ? []
              : [t('travel.sovRaids.jumps', { count: soonest.jumps })]),
          ].join(', '),
          tone: soonest.open ? ('bad' as const) : ('caution' as const),
        };

  // Next wants clocks still ahead: an open window is already underway.
  const deadlines: BoardDeadline[] = views.flatMap((v) =>
    v.hook.window === null || v.open
      ? []
      : [
          {
            at: v.hook.window.startMs,
            note: t('travel.sovRaids.deadline', { subject: v.name }),
            severity: 'warning' as const,
            to: TO,
          },
        ]
  );

  // Nothing reloads on its own: an empty answer from an old read says how old.
  const readAt = data.fetchedAt?.getTime() ?? null;
  const staleEmpty = views.length === 0 && readAt !== null && now - readAt > data.freshForMs;

  return {
    ...blank(TO, statusOf(feed, { isEmpty: views.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    emptyHint: staleEmpty
      ? t('travel.sovRaids.staleEmpty', { age: ageText(t, now, readAt) })
      : undefined,
    number: {
      value: count(views.length),
      unit: t('travel.sovRaids.unit', { count: views.length }),
      secondary,
      tone: worstSeverity(views.map((v) => v.tone)),
    },
    rows: views.map((v) => ({ key: v.hook.key, title: v.name, value: v.text, tone: v.tone })),
    table: {
      columns: [
        {
          key: 'skyhook',
          label: t('travel.sovRaids.col.skyhook'),
          priority: 0,
          nameFloor: true,
          sortable: true,
        },
        { key: 'window', label: t('travel.sovRaids.col.window'), priority: 1, sortable: true },
        {
          key: 'jumps',
          label: t('travel.sovRaids.col.jumps'),
          align: 'end',
          priority: 2,
          sortable: true,
        },
      ],
      rows: views.map((v, i): TableRowModel => {
        // The planet name still names the place when the system names could not be read.
        const place = data.systemNames.get(v.hook.systemId) ?? v.hook.planetName;
        return {
          key: v.hook.key,
          cells: [
            v.name,
            v.hook.window === null ? UNKNOWN : { text: v.text, tone: v.open ? 'bad' : 'caution' },
            v.jumps === undefined ? UNKNOWN : count(v.jumps),
          ],
          // Soonest first is the window column's order; the cell text cannot sort.
          sort: [v.name, i, v.jumps],
          tone: v.tone,
          detail: {
            title: v.name,
            facts: [
              { label: t('travel.sovRaids.fact.window'), value: v.fact },
              { label: t('travel.sovRaids.fact.heldBy'), value: data.alliance?.name ?? UNKNOWN },
            ],
            place:
              place === null
                ? undefined
                : { systemId: v.hook.systemId, name: place, jumps: v.jumps },
          },
        };
      }),
    },
    deadlines,
    summary: t('travel.sovRaids.summary', { count: views.length }),
  };
};
