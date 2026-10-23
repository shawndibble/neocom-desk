/**
 * Mercenary Dens builder (issue #4791): each den's state, ready operations and
 * Anarchy, worst first. Same contract as `models.ts`: pure, derived at render
 * time.
 */
import {
  ANARCHY_SIPHON_LEVEL,
  OPERATION_SOON_MS,
  denHeadline,
  denSeverity,
  denStateAt,
  openOperations,
  readyOperations,
  sortDens,
} from '@/engine/character/mercenaryDens';
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { MercenaryDenRow } from '@/features/character/mercenaryDens';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { HOUR_MS } from '@/lib/age';
import { formatCountdown } from '@/lib/duration';
import { formatNumber } from '@/lib/numberLocale';
import { blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { BoardDeadline } from '../nextDeadline';
import type { NumberModel, TableCell, TableColumn, Translate } from './types';

const W = 'overview.widgets.mercenaryDens';

/** Den detail is an hour-old read, so its reinforcement clock never counts minutes inside that hour. */
function reinforcementText(t: Translate, remainingMs: number): string {
  return remainingMs < HOUR_MS ? t(`${W}.underHour`) : formatCountdown(remainingMs / 1000);
}

/** Operations are a five-minute read: their countdown is exact. */
function operationText(remainingMs: number): string {
  return formatCountdown(remainingMs / 1000);
}

function planetOf(t: Translate, row: MercenaryDenRow): string {
  return row.planetName ?? t(`${W}.unnamed`, { id: row.planetId });
}

function stateCell(t: Translate, row: MercenaryDenRow, now: number): TableCell {
  const state = denStateAt(row, now);
  switch (state) {
    case 'reinforced':
      return {
        text: t(`${W}.state.reinforced`, {
          duration: reinforcementText(t, row.reinforcedUntilMs! - now),
        }),
        tone: 'bad',
      };
    case 'paused':
    case 'disabled':
      return { text: t(`${W}.state.${state}`), tone: 'caution' };
    case 'running':
      return t(`${W}.state.running`);
    case 'unknown':
      return UNKNOWN;
  }
}

function operationsCell(t: Translate, row: MercenaryDenRow, now: number): TableCell {
  if (!row.operationsRead) return UNKNOWN;
  const ready = readyOperations(row, now);
  const next = (ready[0] ?? openOperations(row.operations, now)[0])?.expiresMs;
  if (next === undefined) return t(`${W}.operations.none`);
  const duration = operationText(next - now);
  const text =
    ready.length > 0
      ? t(`${W}.operations.ready`, { count: ready.length, duration })
      : t(`${W}.operations.started`, { duration });
  return next - now < OPERATION_SOON_MS ? { text, tone: 'caution' } : text;
}

function anarchyCell(t: Translate, row: MercenaryDenRow): TableCell {
  if (row.anarchyLevel === null) return UNKNOWN;
  const text = t(`${W}.level`, { level: row.anarchyLevel });
  return row.anarchyLevel >= ANARCHY_SIPHON_LEVEL ? { text, tone: 'bad' } : text;
}

function deadlinesOf(
  t: Translate,
  row: MercenaryDenRow,
  severity: DeadlineSeverity,
  now: number
): BoardDeadline[] {
  if (row.systemId === null) return [];
  const to = routeToHref(row.systemId);
  const planet = planetOf(t, row);
  const clocks: BoardDeadline[] = [];
  if (denStateAt(row, now) === 'reinforced') {
    clocks.push({
      at: row.reinforcedUntilMs!,
      note: t(`${W}.deadline.reinforced`, { planet }),
      severity,
      to,
    });
  }
  const ready = readyOperations(row, now)[0];
  if (ready) {
    clocks.push({
      at: ready.expiresMs,
      note: t(`${W}.deadline.operation`, { planet }),
      severity: ready.expiresMs - now < OPERATION_SOON_MS ? 'warning' : 'watch',
      to,
    });
  }
  return clocks;
}

export const mercenaryDens: Builder = (feeds, { t, now, activeCharacterId, scopeAll }) => {
  const feed = feeds.mercenaryDens;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  // The read covers every Character; a widget on one Character narrows to the header's.
  const everyone = scopeAll || activeCharacterId === null;
  const own = everyone ? null : activeCharacterId;
  const granted = own === null ? data.granted.length > 0 : data.granted.includes(own);
  const ownFailed = own !== null && data.failed.includes(own);
  const rows = sortDens(
    data.rows.filter((row) => own === null || row.characterId === own),
    now
  );
  const status = statusOf(feed, {
    needsPermission: !granted,
    isEmpty: rows.length === 0,
  });
  if (!granted) return blank(null, status);
  // A Character whose own read failed shows Retry, not an empty list.
  if (ownFailed) return blank(null, { ...status, error: true, hasData: false });

  // Each row's severity and state cell, worked out once.
  const views = rows.map((row) => ({
    row,
    severity: denSeverity(row, now),
    state: stateCell(t, row, now),
  }));
  const headline = denHeadline(rows, now);
  const tone = worstSeverity(views.map((view) => view.severity));
  const readyCount = rows.reduce((sum, row) => sum + readyOperations(row, now).length, 0);
  let number: NumberModel;
  if (headline.kind === 'dens') {
    number = {
      value: count(headline.count),
      unit: t(`${W}.unit`, { count: headline.count }),
      tone,
    };
  } else {
    const next = rows.find((row) => row.id === headline.nextId);
    const duration =
      headline.kind === 'reinforced'
        ? reinforcementText(t, headline.remainingMs)
        : operationText(headline.remainingMs);
    number = {
      value: count(headline.count),
      unit: t(`${W}.${headline.kind}Unit`, { count: headline.count }),
      tone,
      secondary: next
        ? {
            text: t(`${W}.${headline.kind}Next`, { planet: planetOf(t, next), duration }),
            tone: 'caution',
          }
        : undefined,
      notes:
        headline.kind === 'reinforced' && readyCount > 0
          ? [t(`${W}.readyNote`, { count: readyCount })]
          : undefined,
    };
  }

  // Only All characters names whose den it is, and only when there is more than one Character.
  const showCharacter = everyone && data.granted.length > 1;
  const columns: TableColumn[] = [
    { key: 'planet', label: t(`${W}.col.planet`), priority: 0, minWidth: 96 },
    { key: 'state', label: t(`${W}.col.state`), priority: 1, minWidth: 124 },
    {
      key: 'operations',
      label: t(`${W}.col.operations`),
      align: 'end',
      priority: 2,
      minWidth: 112,
    },
    { key: 'anarchy', label: t(`${W}.col.anarchy`), align: 'end', priority: 3, minWidth: 80 },
    {
      key: 'infomorphs',
      label: t(`${W}.col.infomorphs`),
      align: 'end',
      priority: 4,
      minWidth: 96,
    },
    { key: 'jumps', label: t(`${W}.col.jumps`), align: 'end', priority: 5, minWidth: 64 },
  ];
  if (showCharacter) {
    columns.push({ key: 'character', label: t(`${W}.col.character`), priority: 6, minWidth: 116 });
  }

  const jumpsText = (row: MercenaryDenRow): string => {
    const jumps = row.systemId === null ? undefined : data.jumps.get(row.systemId);
    return jumps === undefined ? UNKNOWN : formatNumber(jumps);
  };

  const reinforced = rows.filter((row) => denStateAt(row, now) === 'reinforced').length;
  // On All characters an alt that could not be read is named, so its dens are not read as none.
  const unread = everyone ? data.failed.length : 0;
  return {
    ...blank(null, status),
    fetchedAt: data.fetchedAt,
    number,
    rows: views.map(({ row, severity, state }) => ({
      key: row.key,
      title: planetOf(t, row),
      value: typeof state === 'string' ? state : state.text,
      tone: severity,
    })),
    table: {
      fitWidth: true,
      columns,
      rows: views.map(({ row, severity, state }) => {
        const cells: TableCell[] = [
          planetOf(t, row),
          state,
          operationsCell(t, row, now),
          anarchyCell(t, row),
          row.infomorphs === null ? UNKNOWN : formatNumber(row.infomorphs),
          jumpsText(row),
        ];
        if (showCharacter) cells.push(row.characterName);
        return {
          key: row.key,
          cells,
          tone: severity,
          // TODO(#4774): open the den's modal once a row can; until then, Route Safety to its system.
          to: row.systemId === null ? undefined : routeToHref(row.systemId),
        };
      }),
      footer: unread > 0 ? t(`${W}.unread`, { count: unread }) : undefined,
    },
    deadlines: views.flatMap(({ row, severity }) => deadlinesOf(t, row, severity, now)),
    summary: t(`${W}.summary`, { count: rows.length, reinforced }),
  };
};
