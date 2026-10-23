/**
 * Skyhook raids (issue #4798), the member tier of the sovereignty widgets:
 * skyhooks in the Character's alliance space a raider can hit now or soon,
 * from public data. Same contract as `models.ts`: pure, derived at render
 * time. The Station_Manager tier is the Corp Board's `corpSovereignty`; this
 * imports nothing from it.
 *
 * Off the startup graph: `loadSovRaidsWidget` imports and registers this in
 * place of `worldModels.ts`'s stand-in, and its copy lives in the lazy
 * `travel.sovRaids` section, because the shell locale has no room for it
 * (`localeSplit.test.ts`). Only the kind's title, description and empty line
 * stay under `overview.widgets`.
 *
 * No stock and no look-ahead past what `GET /skyhooks/raidable` lists: those
 * need the role.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { liveRaids, raidState, type RaidWindow } from '@/engine/corp/sovereignty';
import { formatCountdown } from '@/lib/duration';
import type { BoardDeadline } from '../nextDeadline';
import { blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { SovRaidSkyhook, SovRaidsWidgetData } from './sovRaidsLoader';
import type { Feeds, KindView, RowDetailModel, TableRowModel, Translate } from './types';

const TO = '/travel/route';

/**
 * How long a read of the public raid lists is trusted (the app-wide freshness
 * window). The loader reads with it and a countdown shorter than it is shown
 * as "under 10m", never to the minute. The cache takes ESI's own expiry when
 * that is later, so a read may be older than this.
 */
export const SOV_RAIDS_CACHE_WINDOW_MS = 10 * 60_000;

type Live = SovRaidSkyhook & { window: RaidWindow };

/** A countdown that never claims more precision than the read behind it. */
function untilText(t: Translate, remainingMs: number): string {
  return remainingMs < SOV_RAIDS_CACHE_WINDOW_MS
    ? t('travel.sovRaids.underCacheWindow', {
        duration: formatCountdown(SOV_RAIDS_CACHE_WINDOW_MS / 1000),
      })
    : formatCountdown(remainingMs / 1000);
}

function nameOf(data: SovRaidsWidgetData, hook: SovRaidSkyhook): string {
  return hook.planetName ?? data.systemNames.get(hook.systemId) ?? UNKNOWN;
}

/** Open is critical: the raid can happen now. Upcoming is a warning: the list only reaches a few hours ahead. */
function toneOf(hook: Live, now: number): DeadlineSeverity {
  return raidState(hook.window, now) === 'open' ? 'critical' : 'warning';
}

/** No alliance, or an alliance holding no sov: the empty state with its reason, never a lock. */
function nothingToDefend(
  t: Translate,
  feed: Feeds['sovRaids'],
  data: SovRaidsWidgetData,
  reason: 'noAlliance' | 'noSov'
): KindView {
  return {
    ...blank(TO, statusOf(feed, { isEmpty: true })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    emptyMessage:
      reason === 'noAlliance' ? t('travel.sovRaids.noAlliance') : t('travel.sovRaids.noSov'),
  };
}

export const sovRaids: Builder = (feeds, { t, now }) => {
  const feed = feeds.sovRaids;
  const data = feed?.data ?? null;
  if (!data) return blank(TO, statusOf(feed));
  if (data.alliance === null) return nothingToDefend(t, feed, data, 'noAlliance');
  if (!data.holdsSov) return nothingToDefend(t, feed, data, 'noSov');

  const live = liveRaids(data.skyhooks, now);
  const isOpen = (hook: Live) => raidState(hook.window, now) === 'open';
  const jumpsOf = (hook: Live) => data.jumps.get(hook.systemId);

  const windowText = (hook: Live): string =>
    isOpen(hook)
      ? t('travel.sovRaids.windowOpen', {
          duration: untilText(t, hook.window.endMs - now),
        })
      : t('travel.sovRaids.windowIn', {
          duration: untilText(t, hook.window.startMs - now),
        });

  const detailOf = (hook: Live): RowDetailModel => {
    const system = data.systemNames.get(hook.systemId);
    return {
      title: nameOf(data, hook),
      facts: [
        {
          label: t('travel.sovRaids.fact.window'),
          value: isOpen(hook)
            ? t('travel.sovRaids.fact.openNow', {
                closes: untilText(t, hook.window.endMs - now),
              })
            : t('travel.sovRaids.fact.upcoming', {
                opens: untilText(t, hook.window.startMs - now),
                closes: untilText(t, hook.window.endMs - now),
              }),
        },
        {
          label: t('travel.sovRaids.fact.heldBy'),
          value: data.alliance?.name ?? UNKNOWN,
        },
      ],
      place:
        system === undefined
          ? undefined
          : { systemId: hook.systemId, name: system, jumps: jumpsOf(hook) },
    };
  };

  const soonest = live[0];
  let secondary: { text: string; tone: 'bad' | 'caution' } | undefined;
  if (soonest !== undefined) {
    const subject = nameOf(data, soonest);
    const jumps = jumpsOf(soonest);
    secondary = {
      text: [
        isOpen(soonest)
          ? t('travel.sovRaids.nextOpenNow', { subject })
          : t('travel.sovRaids.nextOpensIn', {
              subject,
              duration: untilText(t, soonest.window.startMs - now),
            }),
        ...(jumps === undefined ? [] : [t('travel.sovRaids.jumps', { count: jumps })]),
      ].join(', '),
      tone: isOpen(soonest) ? 'bad' : 'caution',
    };
  }

  // Next wants clocks still ahead: an open window is already underway.
  const deadlines: BoardDeadline[] = live
    .filter((hook) => !isOpen(hook))
    .map((hook) => ({
      at: hook.window.startMs,
      note: t('travel.sovRaids.deadline', { subject: nameOf(data, hook) }),
      severity: toneOf(hook, now),
      to: TO,
    }));

  return {
    ...blank(TO, statusOf(feed, { isEmpty: live.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(live.length),
      unit: t('travel.sovRaids.unit', { count: live.length }),
      secondary,
      tone: worstSeverity(live.map((hook) => toneOf(hook, now))),
    },
    rows: live.map((hook) => ({
      key: hook.key,
      title: nameOf(data, hook),
      value: windowText(hook),
      tone: toneOf(hook, now),
    })),
    table: {
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
          sortable: true,
        },
        {
          key: 'jumps',
          label: t('travel.sovRaids.col.jumps'),
          align: 'end',
          priority: 2,
          sortable: true,
        },
      ],
      rows: live.map((hook, i): TableRowModel => {
        const jumps = jumpsOf(hook);
        return {
          key: hook.key,
          cells: [
            nameOf(data, hook),
            { text: windowText(hook), tone: isOpen(hook) ? 'bad' : 'caution' },
            jumps === undefined ? UNKNOWN : count(jumps),
          ],
          // Soonest first is the window column's order; the cell text cannot sort.
          sort: [nameOf(data, hook), i, jumps],
          tone: toneOf(hook, now),
          detail: detailOf(hook),
        };
      }),
    },
    deadlines,
    summary: t('travel.sovRaids.summary', { count: live.length }),
  };
};
