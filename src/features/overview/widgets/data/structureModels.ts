/**
 * Structure and moon-extraction builders. Same contract as `models.ts`:
 * pure, derived at render time.
 */
import { DAY_MS } from '@/lib/age';
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { CorpBoardItem } from '@/engine/corp/board';
import { structureStateLabel } from '@/features/corp/boardSources';
import { formatCountdown } from '@/lib/duration';
import { moonChunksSummary, structuresSummary } from '../../data/boardSummary';
import {
  moonChunkSeverity,
  moonChunksDeadline,
  moonChunksSeverity,
  structureCounts,
  structuresDeadline,
  structuresSeverity,
  structuresView,
} from '../../data/corpCards';
import { blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import { fractionBar } from './cellKit';
import { hbarsFromRows, severityColor } from './chartBuilders';
import type { NumberModel, TableCell, TableModel, Translate } from './types';

const C = 'overview.widgets.chart';

// --- Structures -------------------------------------------------------------------

/** "Efa - Helios Prime" is long on a tile; the name after the system prefix is the one a pilot knows it by. */
export function shortStructureName(name: string): string {
  const cut = name.indexOf(' - ');
  return cut > 0 && cut + 3 < name.length ? name.slice(cut + 3) : name;
}

/**
 * A full tank is not in the data (ESI gives only when the fuel runs out), so the
 * bar reads against a fixed horizon: 30 days of fuel is a full bar.
 */
export const FUEL_BAR_HORIZON_MS = 30 * DAY_MS;

/** The fuel clock's text, with a bar only for a real clock (not "Dry", "Offline" or "Soon"). */
function fuelCell(item: CorpBoardItem, t: Translate): TableCell {
  const text = structureWhen(item, t);
  if (item.timing !== 'timed' || item.withinStaleWindow) return text;
  const bar = fractionBar(item.remainingMs ?? 0, FUEL_BAR_HORIZON_MS);
  return bar === undefined ? text : { text, bar };
}

function structureWhen(item: CorpBoardItem, t: Translate): string {
  if (item.timing === 'passed') return t('overview.board.structureDry');
  if (item.timing === 'untimed') return t('overview.board.structureOffline');
  // A clock shorter than CCP's hour-long cache may already be over, so it is not ticked down.
  if (item.withinStaleWindow) return t('overview.board.structureSoon');
  return formatCountdown(Math.max(0, item.remainingMs ?? 0) / 1000);
}

/**
 * The lowest fuel clock leads (the question a pilot asks of a fleet of
 * structures); with no fuel clock it falls back to the reinforcement count. A
 * zero count is never toned: a warning beside "0 Timers" contradicts itself.
 */
function structuresNumber(
  t: Translate,
  items: readonly CorpBoardItem[],
  timers: number,
  tone: DeadlineSeverity
): NumberModel {
  const lowest = items
    .filter((item) => item.kind === 'structureFuel' && item.timing === 'timed')
    .sort((a, b) => (a.remainingMs ?? 0) - (b.remainingMs ?? 0))[0];
  if (lowest) {
    return {
      value: formatCountdown(Math.max(0, lowest.remainingMs ?? 0) / 1000),
      unit: t('overview.widgets.structures.fuelLeft'),
      secondary: {
        text:
          timers > 0
            ? t('overview.board.structuresTimers', { count: timers })
            : shortStructureName(lowest.subject),
      },
      tone,
    };
  }
  return {
    value: count(timers),
    unit: t('overview.board.reinforced'),
    tone: timers > 0 ? tone : 'clear',
  };
}

export const structures: Builder = (feeds, { t, now }) => {
  const feed = feeds.structures;
  const raw = feed?.data ?? null;
  const to = '/corp';
  if (!raw) return blank(to, statusOf(feed));
  const view = structuresView(raw, now);
  const items = view.items;
  // A grant lapsed: ask for it. No roles: a grant would not fix that, so say so.
  if (items === null) {
    return {
      ...blank(
        to,
        statusOf(feed, { needsPermission: view.needsReauth, isEmpty: !view.needsReauth })
      ),
      emptyMessage: t('overview.board.corpUnreadable'),
      summary: structuresSummary(t, view),
    };
  }
  const counts = structureCounts(items);
  const clock = structuresDeadline(items, now);
  const flagged = items.filter(
    (item) => item.kind !== 'structureFuel' || item.severity !== 'clear'
  );

  // One row per structure, healthy ones too: the pilot asks "is everything fuelled", not only "what is wrong".
  const rows = (raw.structures ?? []).map((source) => {
    const id = source.structureId;
    const fuel = items.find((item) => item.id === `fuel:${id}`);
    const timer = items.find((item) => item.id === `state:${id}`);
    const offline = items.filter((item) => item.id.startsWith(`service:${id}:`));
    const own = [fuel, timer, ...offline].filter(
      (item): item is CorpBoardItem => item !== undefined
    );
    const tone = worstSeverity(own.map((item) => item.severity));
    const state = timer
      ? structureStateLabel(timer.detail)
      : offline.length > 0
        ? t('overview.widgets.structures.state.offline')
        : fuel && (fuel.severity === 'warning' || fuel.severity === 'critical')
          ? t('overview.widgets.structures.state.lowFuel')
          : t('overview.widgets.structures.state.ok');
    return {
      id,
      remaining: fuel?.timing === 'timed' ? (fuel.remainingMs ?? 0) : Number.NEGATIVE_INFINITY,
      tone,
      cells: [
        shortStructureName(source.name),
        fuel ? fuelCell(fuel, t) : UNKNOWN,
        state,
        timer && timer.timing === 'timed' ? structureWhen(timer, t) : UNKNOWN,
      ] as TableCell[],
    };
  });
  rows.sort(
    (a, b) =>
      (a.tone === b.tone ? 0 : worstSeverity([a.tone, b.tone]) === a.tone ? -1 : 1) ||
      a.remaining - b.remaining
  );
  const table: TableModel = {
    columns: [
      { key: 'structure', label: t('overview.widgets.structures.col.structure'), priority: 0 },
      { key: 'fuel', label: t('overview.widgets.structures.col.fuel'), align: 'end', priority: 1 },
      // The row's severity dot and the fuel and timer cells say the same at phone width.
      {
        key: 'state',
        label: t('overview.widgets.structures.col.state'),
        priority: 2,
        hideNarrow: true,
      },
      {
        key: 'timer',
        label: t('overview.widgets.structures.col.timer'),
        align: 'end',
        priority: 3,
      },
    ],
    rows: rows.map((row) => ({ key: String(row.id), cells: row.cells, tone: row.tone })),
  };

  return {
    ...blank(to, statusOf(feed, { isEmpty: view.structureCount === 0 })),
    fetchedAt: view.fetchedAt,
    number: structuresNumber(t, items, counts.timers, structuresSeverity(view) ?? 'clear'),
    rows: flagged.map((item) => ({
      key: item.id,
      title: item.subject,
      detail:
        item.kind === 'structureTimer'
          ? structureStateLabel(item.detail)
          : item.kind === 'serviceOffline'
            ? t('overview.board.serviceOffline', { service: item.detail })
            : t('overview.board.fuelRunsOut'),
      value: structureWhen(item, t),
      tone: item.severity,
    })),
    table,
    deadlines: clock
      ? [
          {
            at: clock.atMs,
            note: t(`overview.board.structureDeadline.${clock.kind}`, { subject: clock.subject }),
            severity: clock.severity,
            to,
          },
        ]
      : [],
    summary: structuresSummary(t, view),
    chart:
      hbarsFromRows(
        t,
        items
          .filter((item) => item.kind === 'structureFuel' && item.timing === 'timed')
          .map((item) => {
            const seconds = Math.max(0, item.remainingMs ?? 0) / 1000;
            return {
              key: item.id,
              label: shortStructureName(item.subject),
              value: seconds,
              text: formatCountdown(seconds),
              color: severityColor(item.severity),
            };
          }),
        t(`${C}.structures.note`)
      ) ?? undefined,
  };
};

// --- Moon extractions -------------------------------------------------------------

export const moonChunks: Builder = (feeds, { t, now }) => {
  const feed = feeds.moonChunks;
  const data = feed?.data ?? null;
  const to = '/corp';
  if (!data) return blank(to, statusOf(feed));
  if (data.chunks === null) {
    return {
      ...blank(
        to,
        statusOf(feed, { needsPermission: data.needsReauth, isEmpty: !data.needsReauth })
      ),
      emptyMessage: t('overview.board.corpUnreadable'),
      summary: moonChunksSummary(t, data, now),
    };
  }
  const chunks = [...data.chunks].sort((a, b) => a.deadlineMs - b.deadlineMs);
  const ready = chunks.filter((chunk) => chunk.detail === 'decay').length;
  const nextChunk = moonChunksDeadline(data.chunks, now);
  const eventOf = (detail: string) =>
    t(`overview.widgets.moonChunks.event.${detail === 'decay' ? 'decay' : 'arrival'}`);
  const untilOf = (deadlineMs: number) => formatCountdown(Math.max(0, deadlineMs - now) / 1000);
  const tone = moonChunksSeverity(data, now) ?? 'clear';

  const table: TableModel = {
    columns: [
      { key: 'drill', label: t('overview.widgets.moonChunks.col.drill'), priority: 0 },
      { key: 'in', label: t('overview.widgets.moonChunks.col.in'), align: 'end', priority: 1 },
      { key: 'event', label: t('overview.widgets.moonChunks.col.event'), priority: 2 },
    ],
    rows: chunks.map((chunk, i) => ({
      key: `${chunk.id}:${i}`,
      cells: [shortStructureName(chunk.subject), untilOf(chunk.deadlineMs), eventOf(chunk.detail)],
      tone: moonChunkSeverity(chunk, now),
    })),
  };

  return {
    ...blank(to, statusOf(feed, { isEmpty: chunks.length === 0 })),
    fetchedAt: data.fetchedAt,
    number:
      ready > 0 || !nextChunk
        ? { value: count(ready), unit: t('overview.widgets.moonChunks.ready'), tone }
        : {
            value: formatCountdown(Math.max(0, nextChunk.deadlineMs - now) / 1000),
            unit: t('overview.widgets.moonChunks.untilNext'),
            secondary: {
              text:
                chunks.length > 1
                  ? t('overview.widgets.moonChunks.queued', {
                      name: shortStructureName(nextChunk.subject),
                      count: chunks.length,
                    })
                  : shortStructureName(nextChunk.subject),
            },
            tone,
          },
    rows: chunks.map((chunk, i) => ({
      key: `${chunk.id}:${i}`,
      title: shortStructureName(chunk.subject),
      detail: eventOf(chunk.detail),
      value: untilOf(chunk.deadlineMs),
      tone: moonChunkSeverity(chunk, now),
    })),
    table,
    deadlines: nextChunk
      ? [
          {
            at: nextChunk.deadlineMs,
            note: t(
              `overview.board.chunkDeadline.${nextChunk.detail === 'decay' ? 'decay' : 'arrival'}`,
              { subject: nextChunk.subject }
            ),
            severity: moonChunkSeverity(nextChunk, now),
            to,
          },
        ]
      : [],
    summary: moonChunksSummary(t, data, now),
  };
};
