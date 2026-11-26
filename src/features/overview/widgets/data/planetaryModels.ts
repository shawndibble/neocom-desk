import { HOUR_MS } from '@/lib/age';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { highlightHref } from '@/lib/highlightParam';
import { formatCountdown } from '@/lib/duration';
import { planetarySeverity } from '../../data/boardSeverity';
import { planetarySummary } from '../../data/boardSummary';
import type { BoardColony, PlanetaryBoardData } from '../../data/boardData';
import { blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import { hbarsFromRows, severityColor } from './chartBuilders';
import type { NumberModel, NumberSecondary, TableModel } from './types';
import type { Translate } from '@/lib/translate';

const C = 'overview.widgets.chart';

interface ColonyFacts {
  key: string;
  planetId: number;
  name: string;
  kind: 'running' | 'expired' | 'idle';
  expiryMs: number | null;
  severity: DeadlineSeverity;
  programs: number | undefined;
}

const COLONY_ORDER = { expired: 0, running: 1, idle: 2 } as const;

function colonyLabel(t: Translate, colony: BoardColony): string {
  const name = colony.name ?? t('overview.widgets.planetary.unnamed', { id: colony.planetId });
  return colony.ownerName === undefined ? name : `${name} · ${colony.ownerName}`;
}

function colonyFacts(data: PlanetaryBoardData, t: Translate): ColonyFacts[] {
  const out: ColonyFacts[] = [];
  for (const batch of data.batches) {
    for (const colony of batch.colonies) {
      out.push({
        key:
          colony.ownerId === undefined
            ? String(colony.planetId)
            : `${colony.ownerId}:${colony.planetId}`,
        planetId: colony.planetId,
        name: colonyLabel(t, colony),
        kind: batch.kind,
        expiryMs: colony.status.soonestExpiryMs,
        severity: batch.severity,
        programs: colony.programCount,
      });
    }
  }
  return out.sort(
    (a, b) =>
      COLONY_ORDER[a.kind] - COLONY_ORDER[b.kind] ||
      (a.expiryMs ?? Number.POSITIVE_INFINITY) - (b.expiryMs ?? Number.POSITIVE_INFINITY)
  );
}

function colonyState(t: Translate, colony: ColonyFacts): string {
  if (colony.kind === 'expired') return t('overview.widgets.planetary.state.stopped');
  if (colony.kind === 'idle') return t('overview.widgets.planetary.state.idle');
  return colony.severity === 'warning' || colony.severity === 'critical'
    ? t('overview.widgets.planetary.state.soon')
    : t('overview.widgets.planetary.state.running');
}

export const planetary: Builder = (feeds, { t, now }) => {
  const feed = feeds.planetary;
  const data = feed?.data ?? null;
  const to = '/planetary-industry';
  if (!data) return blank(to, statusOf(feed));
  const colonies = colonyFacts(data, t);
  const nextBatch = data.batches.find((batch) => batch.kind === 'running');
  const stopped = colonies.filter((colony) => colony.kind === 'expired').length;
  const idle = colonies.filter((colony) => colony.kind === 'idle').length;
  const tone = planetarySeverity(data) ?? 'clear';

  let number: NumberModel;
  if (nextBatch?.expiryMs) {
    const together = nextBatch.colonies.length;
    const secondary: NumberSecondary | undefined =
      stopped > 0
        ? { text: t('overview.widgets.planetary.stopped', { count: stopped }), tone: 'bad' }
        : together > 1
          ? {
              text: t('overview.widgets.planetary.together', {
                count: together,
                total: data.colonyCount,
              }),
            }
          : nextBatch.colonies[0]
            ? {
                text: colonyLabel(t, nextBatch.colonies[0]),
              }
            : undefined;
    number = {
      value: formatCountdown(Math.max(0, nextBatch.expiryMs - now) / 1000),
      unit: t('overview.widgets.planetary.untilNext'),
      secondary,
      tone,
    };
  } else if (stopped > 0) {
    number = { value: count(stopped), unit: t('overview.widgets.planetary.stoppedUnit'), tone };
  } else if (idle > 0) {
    number = { value: count(idle), unit: t('overview.widgets.planetary.idleUnit'), tone };
  } else {
    number = { value: count(data.colonyCount), unit: t('overview.widgets.planetary.unit'), tone };
  }

  const table: TableModel = {
    columns: [
      { key: 'colony', label: t('overview.widgets.planetary.col.colony'), priority: 0 },
      { key: 'ends', label: t('overview.widgets.planetary.col.ends'), align: 'end', priority: 1 },
      { key: 'state', label: t('overview.widgets.planetary.col.state'), priority: 2 },
      {
        key: 'programs',
        label: t('overview.widgets.planetary.col.programs'),
        align: 'end',
        priority: 3,
      },
    ],
    rows: colonies.map((colony) => ({
      key: colony.key,
      cells: [
        colony.name,
        colony.kind === 'running' && colony.expiryMs !== null
          ? formatCountdown(Math.max(0, colony.expiryMs - now) / 1000)
          : UNKNOWN,
        colonyState(t, colony),
        colony.programs === undefined ? UNKNOWN : count(colony.programs),
      ],
      tone: colony.severity,
      to: highlightHref(`${to}/colonies`, String(colony.planetId)),
    })),
  };

  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, isEmpty: data.colonyCount === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number,
    rows: data.batches.map((batch) => ({
      key: `${batch.kind}:${batch.expiryMs ?? 'none'}`,
      title: t(`overview.board.batch.${batch.kind}`, { count: batch.colonies.length }),
      detail: batch.colonies
        .map((colony) =>
          colony.ownerName === undefined
            ? (colony.name ?? `#${colony.planetId}`)
            : colonyLabel(t, colony)
        )
        .join(', '),
      value:
        batch.kind === 'idle'
          ? t('overview.board.noProgram')
          : batch.kind === 'expired'
            ? t('overview.board.stopped')
            : formatCountdown(Math.max(0, (batch.expiryMs ?? 0) - now) / 1000),
      tone: batch.severity,
    })),
    table,
    deadlines: nextBatch?.expiryMs
      ? [
          {
            at: nextBatch.expiryMs,
            note: t('overview.board.batch.running', { count: nextBatch.colonies.length }),
            severity: nextBatch.severity,
            to,
          },
        ]
      : [],
    summary: planetarySummary(t, data),
    chart:
      hbarsFromRows(
        t,
        colonies
          .filter((colony) => colony.kind !== 'running' || colony.expiryMs !== null)
          .map((colony) => {
            if (colony.kind !== 'running') {
              return {
                key: colony.key,
                label: colony.name,
                value: 0,
                share: 0,
                text: colonyState(t, colony),
                color: colony.kind === 'expired' ? ('warning' as const) : undefined,
              };
            }
            const seconds = Math.max(0, (colony.expiryMs ?? 0) - now) / 1000;
            return {
              key: colony.key,
              label: colony.name,
              value: seconds,
              text: formatCountdown(seconds),
              color:
                seconds * 1000 < 12 * HOUR_MS
                  ? ('warning' as const)
                  : severityColor(colony.severity),
            };
          }),
        t(`${C}.planetary.note`)
      ) ?? undefined,
  };
};
