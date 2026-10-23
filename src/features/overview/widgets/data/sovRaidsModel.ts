/**
 * Skyhook raids (issues #4798, #4781), the member tier of the sov widgets:
 * skyhooks raidable now or soon, public data only, cut by the widget's Where
 * setting: the Character's alliance space (a defender's list, an open window is
 * red), or near the Current System within a jumps radius (a hunter's list, an
 * open window is green). Pure, derived at render time. The role tier is the
 * Corp Board's `corpSovereignty`.
 *
 * Copy lives in the lazy `travel.sovRaids` section: the shell locale has no room
 * (`localeSplit.test.ts`). Only title, description and empty line stay under
 * `overview.widgets`.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { closingSoon, liveRaids, nearRaids, raidState } from '@/engine/corp/sovereignty';
import { formatCountdown } from '@/lib/duration';
import { DEFAULT_RAIDS_RADIUS } from '../layout';
import type { BoardDeadline } from '../nextDeadline';
import { ageText, blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { SovRaidSkyhook, SovRaidsWidgetData } from './sovRaidsLoader';
import type { BuildContext, Feeds, KindView, TableRowModel } from './types';

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

export const sovRaids: Builder = (feeds, ctx) => {
  const feed = feeds.sovRaids;
  const data = feed?.data ?? null;
  if (!data) return blank(TO, statusOf(feed));
  return ctx.raidsWhere === 'near' ? nearMe(feed, data, ctx) : myAlliance(feed, data, ctx);
};

function myAlliance(
  feed: Feeds['sovRaids'],
  data: SovRaidsWidgetData,
  { t, now }: BuildContext
): KindView {
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

  const mine = data.skyhooks.filter((hook) => hook.holderId === data.alliance?.id);
  const live = liveRaids(mine, now);
  // Listed as raidable but with no readable window: unknown, never safe, so kept, last.
  const unread = mine
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
}

/** Near me: any holder's skyhooks within the radius of the Current System, the hunter's list. */
function nearMe(
  feed: Feeds['sovRaids'],
  data: SovRaidsWidgetData,
  { t, now, raidsRadius }: BuildContext
): KindView {
  const radius = raidsRadius ?? DEFAULT_RAIDS_RADIUS;
  const until = (remainingMs: number): string =>
    remainingMs < data.freshForMs
      ? t('travel.sovRaids.underCacheWindow', {
          duration: formatCountdown(data.freshForMs / 1000),
        })
      : formatCountdown(remainingMs / 1000);

  const { within, beyond } = nearRaids(data.skyhooks, data.jumps, radius, now);
  const views = within.map((hook) => {
    const { window } = hook;
    const open = window !== null && raidState(window, now) === 'open';
    const yours = data.alliance !== null && hook.holderId === data.alliance.id;
    const late = window !== null && closingSoon(window, now);
    const name = hook.planetName ?? data.systemNames.get(hook.systemId) ?? UNKNOWN;
    const holder =
      hook.holderId === null ? UNKNOWN : (data.holderNames.get(hook.holderId) ?? UNKNOWN);
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
    return {
      hook,
      open,
      yours,
      late,
      name,
      holder,
      text,
      fact,
      jumps: data.jumps.get(hook.systemId),
    };
  });

  // Next wants clocks still ahead, and only the pilot's own space is a deadline: a hunt target is not one.
  const deadlines: BoardDeadline[] = views.flatMap((v) =>
    v.hook.window === null || v.open || !v.yours
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

  const readAt = data.fetchedAt?.getTime() ?? null;
  const staleEmpty = readAt !== null && now - readAt > data.freshForMs;
  // Distances need the Current System: with no distance for any listed skyhook, nothing is guessed.
  const locationUnknown = views.length === 0 && data.jumps.size === 0 && data.skyhooks.length > 0;
  const empty = views.length === 0;
  const emptyMessage = !empty
    ? undefined
    : locationUnknown
      ? t('travel.sovRaids.near.locationUnknown')
      : t('travel.sovRaids.near.none', { radius });
  const emptyHint = !empty
    ? undefined
    : locationUnknown
      ? t('travel.sovRaids.near.locationUnknownHint')
      : staleEmpty
        ? t('travel.sovRaids.staleEmpty', { age: ageText(t, now, readAt) })
        : t('travel.sovRaids.near.noneHint');

  const first = views[0];
  const secondary =
    first === undefined || first.hook.window === null
      ? undefined
      : {
          text: [
            first.open
              ? t('travel.sovRaids.nextOpenNow', { subject: first.name })
              : t('travel.sovRaids.nextOpensIn', {
                  subject: first.name,
                  duration: until(first.hook.window.startMs - now),
                }),
            ...(first.jumps === undefined
              ? []
              : [t('travel.sovRaids.jumps', { count: first.jumps })]),
          ].join(', '),
          tone: first.open && !first.late ? ('good' as const) : ('caution' as const),
        };

  return {
    ...blank(TO, statusOf(feed, { isEmpty: empty })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    emptyMessage,
    emptyHint,
    number: {
      value: count(views.length),
      unit: t('travel.sovRaids.near.unit', { count: views.length, radius }),
      secondary,
      notes: empty ? undefined : [t('travel.sovRaids.near.reach')],
      tone: 'clear',
    },
    rows: views.map((v) => ({
      key: v.hook.key,
      title: v.name,
      value: v.text,
      tone: 'clear' as const,
    })),
    table: {
      fitWidth: true,
      footer:
        beyond > 0 && !empty
          ? t('travel.sovRaids.near.beyond', { count: beyond, radius })
          : undefined,
      columns: [
        {
          key: 'skyhook',
          label: t('travel.sovRaids.col.skyhook'),
          priority: 0,
          nameFloor: true,
          sortable: true,
        },
        {
          key: 'window',
          label: t('travel.sovRaids.col.window'),
          priority: 1,
          minWidth: 130,
          sortable: true,
        },
        {
          key: 'jumps',
          label: t('travel.sovRaids.col.jumps'),
          align: 'end',
          priority: 2,
          sortable: true,
        },
        // The first column to go on a narrow widget: the holder is the least of what a hunter needs.
        {
          key: 'held',
          label: t('travel.sovRaids.fact.heldBy'),
          priority: 3,
          minWidth: 120,
          sortable: true,
        },
      ],
      rows: views.map((v, i): TableRowModel => {
        const place = data.systemNames.get(v.hook.systemId) ?? v.hook.planetName;
        const held = v.yours ? t('travel.sovRaids.near.yourAlliance') : v.holder;
        // Green is opportunity and only with the words; amber once the theft link would not finish.
        const windowTone =
          v.yours || v.late ? ('caution' as const) : v.open ? ('good' as const) : undefined;
        return {
          key: v.hook.key,
          cells: [
            v.name,
            v.hook.window === null
              ? UNKNOWN
              : windowTone === undefined
                ? v.text
                : { text: v.text, tone: windowTone },
            v.jumps === undefined ? UNKNOWN : count(v.jumps),
            v.yours ? { text: held, tone: 'caution' } : held,
          ],
          sort: [v.name, i, v.jumps, v.holder],
          tone: 'clear',
          detail: {
            title: v.name,
            facts: [
              { label: t('travel.sovRaids.fact.window'), value: v.fact },
              {
                label: t('travel.sovRaids.fact.heldBy'),
                value: v.yours ? (data.alliance?.name ?? held) : v.holder,
              },
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
    summary: t('travel.sovRaids.near.summary', { count: views.length, radius }),
  };
}
