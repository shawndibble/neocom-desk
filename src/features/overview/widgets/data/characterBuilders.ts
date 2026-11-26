import { acceleratorSeverity, isAcceleratorLive } from '@/engine/accelerator';
import { severityForRemaining, type DeadlineSeverity } from '@/engine/character/severity';
import { extractableSp, extractorCount } from '@/engine/skills/spExtraction';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown } from '@/lib/duration';
import { DAY_MS } from '@/lib/age';
import { sortQueueEntries, selectActiveEntryFromSorted } from '@/features/overview/overviewQueue';
import { comingUpEventSeverity, spExtractionSeverity } from '../../data/boardSeverity';
import { spExtractionSummary } from '../../data/boardSummary';
import { blank, count, NEUTRAL_NUMBER, statusOf, UNKNOWN, type Builder } from './builderKit';
import { queueSegments, queueStack } from './chartBuilders';
import { acceleratorSlot, calendarTable, spTable, trainingTable } from './characterTables';
import {
  buildCharacterBoard,
  pastDeadlineLabelKey,
  type CharacterBoardItem,
} from '@/engine/character/board';
import { filterByKinds, splitOverdueBeforeToday } from '@/engine/character/deadlines';
import { boardSourcesWithSharedPops } from '@/features/character/calendarSharedPops';
import { DEFAULT_SHARED_POP_TIME } from '@/features/character/calendarSharedPopTime';
import { shownKinds } from '@/features/character/calendarKindFilter';
import { KIND_LABEL } from '@/features/character/calendarKindLabels';
import { sharedPopCalendarHref } from '@/features/character/sharedPopLink';
import { highlightHref, openHref } from '@/lib/highlightParam';
import type { BoardDeadline } from '../nextDeadline';
import type { ListRow } from './types';
import { createNumberFormat, formatNumber } from '@/lib/numberLocale';

const formatSp = createNumberFormat({ maximumFractionDigits: 3 });

export const training: Builder = (feeds, { t, now, notTrainingAlert, activeCharacterId, show }) => {
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
      statusOf(feed, {
        needsPermission: data.queueNeedsReauth,
        hasStaleData: data.queueResult !== null,
      })
    ),
    fetchedAt: data.queueResult?.fetchedAt ?? null,
    fromCache: data.queueResult?.fromCache ?? false,
  };

  const record =
    show === 'skillsOnly' || activeCharacterId === null
      ? undefined
      : feeds.accelerator?.data?.get(activeCharacterId);
  const accelerator =
    record && isAcceleratorLive(record, now)
      ? {
          label: t('overview.widgets.training.accelerator', { bonus: record.bonus }),
          expiresAt: record.expiresAt,
          severity: acceleratorSeverity(record.expiresAt - now),
        }
      : null;
  const acceleratorRows: ListRow[] = accelerator
    ? [
        {
          key: 'accelerator',
          title: accelerator.label,
          detail: t('overview.widgets.training.acceleratorEnds'),
          value: formatCountdown(Math.max(0, accelerator.expiresAt - now) / 1000),
          tone: accelerator.severity,
        },
      ]
    : [];
  const acceleratorDeadlines: BoardDeadline[] = accelerator
    ? [
        {
          at: accelerator.expiresAt,
          note: t('overview.board.acceleratorEnds'),
          severity: accelerator.severity,
          to,
        },
      ]
    : [];

  const finishOf = (entry: { finish_date?: string }) =>
    entry.finish_date ? Date.parse(entry.finish_date) : null;
  const liveEntries = sorted.filter((entry) => {
    const finish = finishOf(entry);
    return finish === null || finish > now;
  });
  const skillRows: ListRow[] = liveEntries.map((entry) => {
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

  const rows = [...skillRows];
  if (accelerator) {
    rows.splice(
      acceleratorSlot(
        liveEntries.map((entry) => finishOf(entry)),
        accelerator.expiresAt
      ),
      0,
      ...acceleratorRows
    );
  }

  if (!active) {
    return {
      ...base,
      number: {
        value: t('overview.widgets.training.idle'),
        tone: notTrainingAlert ? 'warning' : 'clear',
      },
      rows,
      deadlines: acceleratorDeadlines,
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
    table: trainingTable(t, sorted, now, nameOf, accelerator),
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
    deadlines: [
      ...(finish !== null && finish > now
        ? [{ at: finish, note: t('overview.board.nextSkill'), severity: 'clear' as const, to }]
        : []),
      ...acceleratorDeadlines,
    ],
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
            value: formatSp(total),
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

function boardItemHref(item: CharacterBoardItem): string {
  if (item.kind === 'calendarEvent') return openHref('/calendar', item.sourceId);
  if (item.kind === 'sharedMoonPop') return sharedPopCalendarHref(item.detailId ?? item.sourceId);
  if (item.kind === 'contractExpiry') return highlightHref('/contracts/history', item.sourceId);
  return '/calendar';
}

const isCommitted = (item: CharacterBoardItem) =>
  item.response === 'accepted' || item.response === 'tentative';

export const comingUp: Builder = (
  feeds,
  { t, now, zone, calendarEvents, hiddenKinds = [], sharedPopTime = DEFAULT_SHARED_POP_TIME }
) => {
  const feed = feeds.calendar;
  const data = feed?.data ?? null;
  const to = '/calendar';
  if (!data) return blank(to, statusOf(feed));
  const board = buildCharacterBoard({
    ...boardSourcesWithSharedPops(data, sharedPopTime),
    nowMs: now,
  });
  const all = calendarEvents === 'all';
  const shown = shownKinds(hiddenKinds);
  const items = splitOverdueBeforeToday(
    filterByKinds(board, shown).filter(
      (item) => all || item.kind !== 'calendarEvent' || isCommitted(item)
    ),
    now,
    zone
  ).rest;
  const next = items.find((item) => item.deadlineMs > now);
  const laterToday = items.filter(
    (item) => item !== next && item.deadlineMs > now && item.deadlineMs <= now + DAY_MS
  ).length;
  const soonest = board.find(
    (item) => item.kind === 'calendarEvent' && item.deadlineMs > now && isCommitted(item)
  );
  const countdown = (item: CharacterBoardItem) =>
    item.deadlineMs > now
      ? formatCountdown((item.deadlineMs - now) / 1000)
      : t(item.pastLabelKey ?? pastDeadlineLabelKey(item.kind));
  const kindText = (item: CharacterBoardItem) =>
    [
      t(KIND_LABEL[item.kind]),
      item.response === null ? null : t(`overview.board.response.${item.response}`),
      item.corporation?.name,
      item.sharedBy?.name,
      item.characterName,
    ]
      .filter(Boolean)
      .join(' · ');
  const lapsed = data.reauthKinds.some((kind) => shown.has(kind));
  const readable = data.readableKinds.some((kind) => shown.has(kind));
  return {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: lapsed,
        isEmpty: items.length === 0,
        hasStaleData: readable,
      })
    ),
    emptyMessage:
      shown.size === 0
        ? t('overview.widgets.comingUp.allHidden')
        : t('overview.widgets.comingUp.empty'),
    fetchedAt: data.oldestFetchedAt,
    fromCache: data.fromCache,
    number: next
      ? {
          value: formatCountdown((next.deadlineMs - now) / 1000),
          unit:
            laterToday > 0 ? t('overview.widgets.comingUp.more', { count: laterToday }) : undefined,
          secondary: { text: next.subject },
          tone: comingUpEventSeverity(next.deadlineMs, now),
        }
      : NEUTRAL_NUMBER,
    rows: items.map((item) => ({
      key: item.id,
      title: item.subject,
      detail: kindText(item),
      value: countdown(item),
      tone: comingUpEventSeverity(item.deadlineMs, now),
      to: boardItemHref(item),
    })),
    table: calendarTable(
      t,
      items.map((item) => ({
        key: item.id,
        subject: item.subject,
        when: countdown(item),
        kind: kindText(item),
        tone: comingUpEventSeverity(item.deadlineMs, now),
        to: boardItemHref(item),
      }))
    ),
    deadlines: soonest
      ? [
          {
            at: soonest.deadlineMs,
            note: soonest.subject,
            severity: severityForRemaining(soonest.deadlineMs - now),
            to: boardItemHref(soonest),
          },
        ]
      : [],
    summary: next
      ? t('overview.board.comingUpNext', {
          title: next.subject,
          when: formatCountdown((next.deadlineMs - now) / 1000),
        })
      : t('overview.board.comingUpNone'),
  };
};
