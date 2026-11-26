import { DAY_MS } from '@/lib/age';
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { CorpBoardItem } from '@/engine/corp/board';
import type { BoardClockSource } from '@/engine/character/board';
import { structureStateLabel } from '@/features/corp/boardSources';
import { toBoardStarbases, toStructureSources } from './towerSources';
import {
  shortStructureName,
  structureRows,
  structureWhen,
} from '@/features/corp/structures/structureRows';
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
import { corpCell, fractionBar } from './cellKit';
import { flagPartlyFailed } from './corpAcrossKit';
import { hbarsFromRows, severityColor } from './chartBuilders';
import type { NumberModel, TableCell, TableModel } from './types';
import type { Translate } from '@/lib/translate';
import { popShareMarkLabel } from '@/features/corp/taxBook/popShareMarkLabel';

const C = 'overview.widgets.chart';
const STRUCTURES_PAGE = '/corp/structures';

export const FUEL_BAR_HORIZON_MS = 30 * DAY_MS;

function fuelCell(item: CorpBoardItem, t: Translate): TableCell {
  const text = structureWhen(item, t);
  if (item.timing !== 'timed' || item.withinStaleWindow) return text;
  const bar = fractionBar(item.remainingMs ?? 0, FUEL_BAR_HORIZON_MS);
  return bar === undefined ? text : { text, bar };
}

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

function problemsNumber(
  t: Translate,
  rows: readonly { name: string; tone: DeadlineSeverity }[]
): NumberModel {
  return {
    value: count(rows.length),
    unit: t('overview.widgets.structures.needAttention', { count: rows.length }),
    secondary: rows[0] ? { text: rows[0].name } : undefined,
    tone: worstSeverity(rows.map((row) => row.tone)),
  };
}

export const structures: Builder = (feeds, { t, now, show, scopeAll }) => {
  const feed = scopeAll ? feeds.structuresAll : feeds.structures;
  const raw = feed?.data ?? null;
  const to = STRUCTURES_PAGE;
  if (!raw) return blank(to, statusOf(feed));
  const towerFeed = scopeAll ? feeds.corpStarbasesAll : feeds.corpStarbases;
  const towerData = towerFeed?.data?.readable ? towerFeed.data : null;
  const towers = towerData ? toStructureSources(towerData, now) : [];
  const view = structuresView(raw, now, towerData ? toBoardStarbases(towerData, now) : undefined);
  const items = view.items;
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

  const corporations = new Map([...(towerData?.corporations ?? []), ...(raw.corporations ?? [])]);
  const labels = corporations.size > 1 ? corporations : undefined;
  const all = structureRows([...(raw.structures ?? []), ...towers], items).map((row) => {
    const { source, fuel, timer, offline, lowFuel } = row;
    const corp =
      labels && source.corporationId !== undefined ? labels.get(source.corporationId) : undefined;
    const state = timer
      ? structureStateLabel(timer.detail)
      : offline.length > 0
        ? t('overview.widgets.structures.state.offline')
        : lowFuel
          ? t('overview.widgets.structures.state.lowFuel')
          : t('overview.widgets.structures.state.ok');
    return {
      ...row,
      id: source.structureId,
      name: shortStructureName(source.name),
      cells: [
        shortStructureName(source.name),
        ...(labels ? [corp ? corpCell(corp) : UNKNOWN] : []),
        fuel ? fuelCell(fuel, t) : UNKNOWN,
        state,
        timer && timer.timing === 'timed' ? structureWhen(timer, t) : UNKNOWN,
      ] as TableCell[],
    };
  });
  all.sort(
    (a, b) =>
      (a.tone === b.tone ? 0 : worstSeverity([a.tone, b.tone]) === a.tone ? -1 : 1) ||
      a.remaining - b.remaining
  );
  const problemsOnly = show === 'problems';
  const { structureCount } = view;
  const rows = problemsOnly ? all.filter((row) => row.problem) : all;
  const shown = problemsOnly ? rows.flatMap((row) => row.items) : items;
  const counts = structureCounts(shown);
  const clock = structuresDeadline(shown, now);
  const flagged = shown.filter(
    (item) => item.kind !== 'structureFuel' || item.severity !== 'clear'
  );
  const table: TableModel = {
    columns: [
      { key: 'structure', label: t('overview.widgets.structures.col.structure'), priority: 0 },
      ...(labels
        ? [{ key: 'corp', label: t('overview.widgets.structures.col.corp'), priority: 4 }]
        : []),
      { key: 'fuel', label: t('overview.widgets.structures.col.fuel'), align: 'end', priority: 1 },
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
    rows: rows.map((row) => ({
      key: String(row.id),
      cells: row.cells,
      tone: row.tone,
      to: `${to}?structure=${row.id}`,
    })),
  };

  return {
    ...blank(to, {
      ...statusOf(feed, { isEmpty: problemsOnly ? rows.length === 0 : structureCount === 0 }),
      ...(raw.partlyFailed || towerData?.partlyFailed ? { error: true } : {}),
    }),
    ...(problemsOnly && rows.length === 0 && structureCount > 0
      ? { emptyMessage: t('overview.widgets.structures.noProblems'), emptyHealthy: true }
      : {}),
    fetchedAt: view.fetchedAt,
    number: problemsOnly
      ? problemsNumber(t, rows)
      : structuresNumber(t, items, counts.timers, structuresSeverity(view) ?? 'clear'),
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
          },
        ]
      : [],
    summary: structuresSummary(t, { ...view, structureCount, items: shown }),
    chart:
      hbarsFromRows(
        t,
        shown
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

export const moonChunks: Builder = (feeds, { t, now, scopeAll }) => {
  const feed = scopeAll ? feeds.moonChunksAll : feeds.moonChunks;
  const data = feed?.data ?? null;
  const to = '/corp/moons/extractions';
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
  const chunks = data.chunks
    .filter((chunk) => chunk.deadlineMs > now)
    .sort((a, b) => a.deadlineMs - b.deadlineMs);
  const ready = chunks.filter((chunk) => chunk.detail === 'decay').length;
  const nextChunk = moonChunksDeadline(data.chunks, now);
  const eventOf = (detail: string) =>
    t(`overview.widgets.moonChunks.event.${detail === 'decay' ? 'decay' : 'arrival'}`);
  const untilOf = (deadlineMs: number) => formatCountdown(Math.max(0, deadlineMs - now) / 1000);
  const tone = moonChunksSeverity({ ...data, chunks }, now) ?? 'clear';

  const named =
    scopeAll && new Set(chunks.map((chunk) => chunk.corporation?.id).filter(Boolean)).size > 1;
  const corpOf = (chunk: BoardClockSource) => (named ? chunk.corporation : undefined);
  const drillCell = (chunk: BoardClockSource): TableCell => {
    const text = shortStructureName(chunk.subject);
    const mark = data.shareMarks?.[chunk.id];
    return mark
      ? { text, share: { label: popShareMarkLabel(t, mark), off: mark.kind === 'opted-out' } }
      : text;
  };

  const table: TableModel = {
    columns: [
      { key: 'drill', label: t('overview.widgets.moonChunks.col.drill'), priority: 0 },
      ...(named
        ? [{ key: 'corp', label: t('overview.widgets.moonChunks.col.corp'), priority: 3 }]
        : []),
      { key: 'in', label: t('overview.widgets.moonChunks.col.in'), align: 'end', priority: 1 },
      { key: 'event', label: t('overview.widgets.moonChunks.col.event'), priority: 2 },
    ],
    rows: chunks.map((chunk, i) => {
      const corp = corpOf(chunk);
      return {
        key: `${chunk.corporation?.id ?? ''}:${chunk.id}:${i}`,
        cells: [
          drillCell(chunk),
          ...(named ? [corp ? corpCell(corp) : UNKNOWN] : []),
          untilOf(chunk.deadlineMs),
          eventOf(chunk.detail),
        ],
        tone: moonChunkSeverity(chunk, now),
      };
    }),
  };

  return {
    ...flagPartlyFailed(
      blank(to, statusOf(feed, { isEmpty: chunks.length === 0 })),
      scopeAll && data.partlyFailed === true
    ),
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
    rows: chunks.map((chunk, i) => {
      const corp = corpOf(chunk);
      return {
        key: `${chunk.corporation?.id ?? ''}:${chunk.id}:${i}`,
        title: shortStructureName(chunk.subject),
        detail: corp ? `${corp.ticker} · ${eventOf(chunk.detail)}` : eventOf(chunk.detail),
        value: untilOf(chunk.deadlineMs),
        tone: moonChunkSeverity(chunk, now),
      };
    }),
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
