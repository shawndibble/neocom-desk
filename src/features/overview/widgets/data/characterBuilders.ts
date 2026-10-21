/**
 * The Training, SP and Coming up builders: the Character-clock kinds, split
 * out of `models.ts`.
 */
import { severityForRemaining, type DeadlineSeverity } from '@/engine/character/severity';
import {
  soonestCalendarDeadline,
  upcomingCommittedEvents,
  upcomingEvents,
} from '@/engine/character/calendarDeadline';
import { extractableSp, extractorCount } from '@/engine/skills/spExtraction';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { DAY_MS } from '@/lib/age';
import { sortQueueEntries, selectActiveEntryFromSorted } from '@/features/overview/overviewQueue';
import {
  comingUpEventSeverity,
  comingUpSeverity,
  spExtractionSeverity,
} from '../../data/boardSeverity';
import { comingUpSummary, spExtractionSummary } from '../../data/boardSummary';
import { blank, count, NEUTRAL_NUMBER, statusOf, UNKNOWN, type Builder } from './builderKit';
import { queueSegments, queueStack } from './chartBuilders';
import { comingUpTable, spTable, trainingTable } from './characterTables';
import type { ListRow } from './types';
import { formatNumber } from '@/lib/numberLocale';

export const training: Builder = (feeds, { t, now, notTrainingAlert }) => {
  const feed = feeds.skills;
  const data = feed?.data ?? null;
  const to = '/skills/plans';
  if (!data) return blank(to, statusOf(feed));
  const queue = data.queueResult?.data ?? [];
  const sorted = sortQueueEntries(queue);
  const active = selectActiveEntryFromSorted(sorted, now);
  const nameOf = (skillId: number) =>
    data.catalog.bySkillTypeID.get(skillId)?.name ?? `#${skillId}`;
  const base = {
    ...blank(
      to,
      // A lapsed grant over a saved queue keeps the queue (with a sign-in note).
      statusOf(feed, {
        needsPermission: data.queueNeedsReauth,
        hasStaleData: data.queueResult !== null,
      })
    ),
    fetchedAt: data.queueResult?.fetchedAt ?? null,
    fromCache: data.queueResult?.fromCache ?? false,
  };

  const finishOf = (entry: { finish_date?: string }) =>
    entry.finish_date ? Date.parse(entry.finish_date) : null;
  const rows: ListRow[] = sorted
    .filter((entry) => {
      const finish = finishOf(entry);
      return finish === null || finish > now;
    })
    .map((entry) => {
      const finish = finishOf(entry);
      return {
        key: `${entry.skill_id}:${entry.queue_position}`,
        title: t('overview.widgets.training.skillLevel', {
          name: nameOf(entry.skill_id),
          level: entry.finished_level,
        }),
        detail: t(
          entry === active ? 'overview.widgets.training.now' : 'overview.widgets.training.next'
        ),
        value: finish === null ? UNKNOWN : formatCountdown(Math.max(0, finish - now) / 1000),
        tone: 'clear' as DeadlineSeverity,
      };
    });

  if (!active) {
    return {
      ...base,
      number: {
        value: t('overview.widgets.training.idle'),
        tone: notTrainingAlert ? 'warning' : 'clear',
      },
      rows,
      summary: t('overview.board.notTraining'),
    };
  }
  const finish = finishOf(active);
  const segments = queueSegments(sorted, now);
  return {
    ...base,
    chart:
      queueStack(
        t,
        segments.map(({ entry, seconds }) => ({
          key: `${entry.skill_id}:${entry.queue_position}`,
          label: t('overview.widgets.training.skillLevel', {
            name: nameOf(entry.skill_id),
            level: entry.finished_level,
          }),
          seconds,
        })),
        (seconds) => formatCountdown(seconds)
      ) ?? undefined,
    table: trainingTable(t, sorted, now, nameOf),
    number: {
      value: finish === null ? UNKNOWN : formatCountdown(Math.max(0, finish - now) / 1000),
      secondary: {
        text: t('overview.widgets.training.skillLevel', {
          name: nameOf(active.skill_id),
          level: active.finished_level,
        }),
      },
      tone: 'clear',
    },
    rows,
    deadlines:
      finish !== null && finish > now
        ? [{ at: finish, note: t('overview.board.nextSkill'), severity: 'clear', to }]
        : [],
    summary: nameOf(active.skill_id),
  };
};

export const sp: Builder = (feeds, { t }) => {
  const skills = feeds.skills;
  const extras = feeds.spExtras?.data ?? null;
  const data = skills?.data ?? null;
  const to = '/characters';
  if (!data || !extras) return blank(to, statusOf(skills, { hasData: false }));
  const extraction = {
    totalSp: data.totalSp,
    monitoring: extras.monitoring,
    thresholdSp: extras.thresholdSp,
    price: extras.price,
  };
  const total = data.totalSp;
  const unallocated = data.skillsResult?.data.unallocated_sp ?? null;
  const rows: ListRow[] =
    total === null
      ? []
      : [
          {
            key: 'total',
            title: t('skills.totalSp'),
            value: formatNumber(total),
            tone: 'clear',
          },
          {
            key: 'unallocated',
            title: t('skills.unallocatedSp'),
            value: unallocated === null ? UNKNOWN : formatNumber(unallocated),
            tone: 'clear',
          },
          {
            key: 'spare',
            title: t('overview.board.spareSp'),
            value: formatCompactNumber(extractableSp(total)),
            tone: 'clear',
          },
          {
            key: 'extractors',
            title: t('overview.board.extractors'),
            value: count(extractorCount(total)),
            tone: spExtractionSeverity(extraction) === 'watch' ? 'watch' : 'clear',
          },
        ];
  return {
    ...blank(
      to,
      statusOf(skills, {
        needsPermission: data.skillsResult === null && total === null,
        hasData: true,
      })
    ),
    fetchedAt: data.skillsResult?.fetchedAt ?? null,
    fromCache: data.skillsResult?.fromCache ?? false,
    number:
      total === null
        ? NEUTRAL_NUMBER
        : {
            value: formatCompactNumber(total),
            unit: t('overview.widgets.sp.unit'),
            // Unallocated SP is the pilot's to spend; it leads, the extraction summary is the fallback.
            secondary: {
              text:
                unallocated !== null && unallocated > 0
                  ? t('overview.widgets.sp.unallocated', { sp: formatCompactNumber(unallocated) })
                  : spExtractionSummary(t, extraction),
            },
            tone: spExtractionSeverity(extraction) ?? 'clear',
          },
    rows,
    table:
      total === null
        ? undefined
        : spTable(t, { totalSp: total, unallocatedSp: unallocated, extras }),
    summary: spExtractionSummary(t, extraction),
  };
};

export const comingUp: Builder = (feeds, { t, now, calendarEvents }) => {
  const feed = feeds.calendar;
  const data = feed?.data ?? null;
  const to = '/calendar';
  if (!data) return blank(to, statusOf(feed));
  const all = calendarEvents === 'all';
  const upcoming = all
    ? upcomingEvents(data.events, now)
    : upcomingCommittedEvents(data.events, now);
  const next = upcoming[0];
  const soonest = soonestCalendarDeadline(data.events, now);
  const laterToday = upcoming.filter(
    (event) => event !== next && event.atMs <= now + DAY_MS
  ).length;
  return {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: data.needsReauth,
        isEmpty: upcoming.length === 0,
        // A read time means the events came from a real (cached) read.
        hasStaleData: data.fetchedAt !== null,
      })
    ),
    emptyMessage: all ? t('overview.widgets.comingUp.emptyAll') : undefined,
    emptyHint: all ? undefined : t('overview.widgets.comingUp.emptyHint'),
    fetchedAt: data.fetchedAt,
    number: next
      ? {
          value: formatCountdown((next.atMs - now) / 1000),
          // The others within a day: the one fact the headline event does not carry.
          unit:
            laterToday > 0 ? t('overview.widgets.comingUp.more', { count: laterToday }) : undefined,
          secondary: { text: next.title },
          tone: all
            ? comingUpEventSeverity(next.atMs, now)
            : (comingUpSeverity(data, now) ?? 'clear'),
        }
      : NEUTRAL_NUMBER,
    rows: upcoming.map((event) => ({
      key: String(event.eventId),
      title: event.title,
      detail: t(`overview.board.response.${event.response}`),
      value: formatDuration((event.atMs - now) / 1000),
      tone: comingUpEventSeverity(event.atMs, now),
    })),
    table: comingUpTable(t, upcoming, now, comingUpEventSeverity),
    deadlines: soonest
      ? [
          {
            at: soonest.atMs,
            note: soonest.title,
            severity: severityForRemaining(soonest.atMs - now),
            to,
          },
        ]
      : [],
    summary: comingUpSummary(t, data, now),
  };
};
