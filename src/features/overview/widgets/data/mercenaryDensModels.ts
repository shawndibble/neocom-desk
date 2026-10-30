/**
 * Mercenary Dens builder (issue #4791): each den's state, ready operations and
 * Anarchy, worst first. Same contract as `models.ts`: pure, derived at render
 * time.
 */
import {
  ANARCHY_SIPHON_LEVEL,
  type DenOperation,
  type DenState,
  OPERATION_SOON_MS,
  denHeadline,
  denSeverity,
  denStateAt,
  openOperations,
  readyOperations,
  sortDens,
} from '@/engine/character/mercenaryDens';
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { MercenaryDenRow, MercenaryDensWidgetData } from '@/features/character/mercenaryDens';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { HOUR_MS } from '@/lib/age';
import { formatCountdown } from '@/lib/duration';
import { formatNumber } from '@/lib/numberLocale';
import { blank, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { BoardDeadline } from '../nextDeadline';
import type { DetailTone, NumberModel, RowDetailModel, TableCell, TableColumn } from './types';
import type { Translate } from '@/lib/translate';

/**
 * This kind's copy key. A helper rather than `` `${W}.x` `` templates: the
 * locale splitter reads a `${…}.x` template as naming every `x` key in every
 * lazy section, and keeps them all in the startup shell.
 */
const k = (key: string) => `overview.widgets.mercenaryDens.${key}`;

/** Den detail is an hour-old read, so its reinforcement clock never counts minutes inside that hour. */
function reinforcementText(t: Translate, remainingMs: number): string {
  return remainingMs < HOUR_MS ? t(k(`underHour`)) : formatCountdown(remainingMs / 1000);
}

/** Operations are a five-minute read: their countdown is exact. */
function operationText(remainingMs: number): string {
  return formatCountdown(remainingMs / 1000);
}

function planetOf(t: Translate, row: MercenaryDenRow): string {
  return row.planetName ?? t(k(`unnamed`), { id: row.planetId });
}

function stateCell(t: Translate, row: MercenaryDenRow, now: number): TableCell {
  const state = denStateAt(row, now);
  switch (state) {
    case 'reinforced':
      return {
        text: t(k(`state.reinforced`), {
          duration: reinforcementText(t, row.reinforcedUntilMs! - now),
        }),
        tone: 'bad',
      };
    case 'paused':
    case 'disabled':
      return { text: t(k(`state.${state}`)), tone: 'caution' };
    case 'running':
      return t(k(`state.running`));
    case 'unknown':
      return UNKNOWN;
  }
}

function operationsCell(t: Translate, row: MercenaryDenRow, now: number): TableCell {
  if (!row.operationsRead) return UNKNOWN;
  const ready = readyOperations(row, now);
  const next = (ready[0] ?? openOperations(row.operations, now)[0])?.expiresMs;
  if (next === undefined) return t(k(`operations.none`));
  const duration = operationText(next - now);
  const text =
    ready.length > 0
      ? t(k(`operations.ready`), { count: ready.length, duration })
      : t(k(`operations.started`), { duration });
  return next - now < OPERATION_SOON_MS ? { text, tone: 'caution' } : text;
}

function anarchyCell(t: Translate, row: MercenaryDenRow): TableCell {
  if (row.anarchyLevel === null) return UNKNOWN;
  const text = t(k(`level`), { level: row.anarchyLevel });
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
      note: t(k(`deadline.reinforced`), { planet }),
      severity,
      to,
    });
  }
  const ready = readyOperations(row, now)[0];
  if (ready) {
    clocks.push({
      at: ready.expiresMs,
      note: t(k(`deadline.operation`), { planet }),
      severity: ready.expiresMs - now < OPERATION_SOON_MS ? 'warning' : 'watch',
      to,
    });
  }
  return clocks;
}

const STATE_TONE: Record<DenState, DetailTone> = {
  reinforced: 'danger',
  paused: 'warning',
  disabled: 'warning',
  running: 'success',
  unknown: 'neutral',
};

const OPERATION_TONE: Record<DenOperation['state'], DetailTone> = {
  available: 'warning',
  started: 'neutral',
  done: 'neutral',
};

function detailOf(
  t: Translate,
  data: MercenaryDensWidgetData,
  row: MercenaryDenRow,
  now: number
): RowDetailModel {
  const state = denStateAt(row, now);
  const systemName = row.systemId === null ? undefined : data.systemNames.get(row.systemId);
  const owner =
    row.skyhookOwnerId === null
      ? UNKNOWN
      : (data.ownerNames.get(row.skyhookOwnerId) ?? `#${row.skyhookOwnerId}`);
  const meter = (key: 'development' | 'anarchy', level: number | null, amount: number | null) => ({
    label: t(k(`col.${key}`)),
    badge: level === null ? UNKNOWN : t(k(`level`), { level }),
    value: amount ?? 0,
    max: 100,
    readout: amount === null ? UNKNOWN : t(k(`detail.amount`), { amount }),
    note: key === 'anarchy' ? t(k(`detail.anarchyNote`)) : undefined,
  });
  return {
    title: t(k(`detail.title`), { planet: planetOf(t, row) }),
    status: {
      badge: state === 'unknown' ? t(k(`detail.stateUnknown`)) : t(k(`detail.state.${state}`)),
      tone: STATE_TONE[state],
      text:
        state === 'reinforced'
          ? t(k(`detail.comesOut`), {
              duration: reinforcementText(t, row.reinforcedUntilMs! - now),
            })
          : undefined,
      note:
        state === 'reinforced'
          ? t(k(`detail.shieldsNote`))
          : state === 'disabled'
            ? t(k(`detail.disabledNote`))
            : undefined,
    },
    facts: [
      {
        label: t(k(`col.infomorphs`)),
        value: row.infomorphs === null ? UNKNOWN : formatNumber(row.infomorphs),
      },
      { label: t(k(`col.character`)), value: row.characterName },
      { label: t(k(`detail.owner`)), value: owner },
      // No list to show: say so, unknown when the read had a gap, never an empty heading.
      ...(row.operationsRead && row.operations.length > 0
        ? []
        : [
            {
              label: t(k(`col.operations`)),
              value: row.operationsRead ? t(k(`operations.none`)) : UNKNOWN,
            },
          ]),
    ],
    meters: {
      title: t(k(`detail.evolution`)),
      items: [
        meter('development', row.developmentLevel, row.developmentAmount),
        meter('anarchy', row.anarchyLevel, row.anarchyAmount),
      ],
    },
    list:
      row.operationsRead && row.operations.length > 0
        ? {
            title: t(k(`col.operations`)),
            items: row.operations
              .map((op, index) => ({ op, index }))
              .sort((a, b) => (a.op.expiresMs ?? 0) - (b.op.expiresMs ?? 0))
              .map(({ op, index }) => ({
                key: `${index}`,
                badge: t(k(`detail.operation.${op.state}`)),
                tone: OPERATION_TONE[op.state],
                text: t(k(`detail.operationName`)),
                value:
                  op.expiresMs === null
                    ? UNKNOWN
                    : op.state !== 'done' && op.expiresMs > now
                      ? t(k(`detail.expiresIn`), { duration: operationText(op.expiresMs - now) })
                      : t(k(`detail.ended`)),
              })),
          }
        : undefined,
    place:
      row.systemId === null || systemName === undefined
        ? undefined
        : { systemId: row.systemId, name: systemName, jumps: data.jumps.get(row.systemId) },
  };
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
      unit: t(k(`unit`), { count: headline.count }),
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
      unit: t(k(`${headline.kind}Unit`), { count: headline.count }),
      tone,
      secondary: next
        ? {
            text: t(k(`${headline.kind}Next`), { planet: planetOf(t, next), duration }),
            tone: 'caution',
          }
        : undefined,
      notes:
        headline.kind === 'reinforced' && readyCount > 0
          ? [t(k(`readyNote`), { count: readyCount })]
          : undefined,
    };
  }

  // Only All characters names whose den it is, and only when there is more than one Character.
  const showCharacter = everyone && data.granted.length > 1;
  const columns: TableColumn[] = [
    { key: 'planet', label: t(k(`col.planet`)), priority: 0, minWidth: 96 },
    { key: 'state', label: t(k(`col.state`)), priority: 1, minWidth: 124 },
    {
      key: 'operations',
      label: t(k(`col.operations`)),
      align: 'end',
      priority: 2,
      minWidth: 112,
    },
    { key: 'anarchy', label: t(k(`col.anarchy`)), align: 'end', priority: 3, minWidth: 80 },
    {
      key: 'infomorphs',
      label: t(k(`col.infomorphs`)),
      align: 'end',
      priority: 4,
      minWidth: 96,
    },
    { key: 'jumps', label: t(k(`col.jumps`)), align: 'end', priority: 5, minWidth: 64 },
  ];
  if (showCharacter) {
    columns.push({ key: 'character', label: t(k(`col.character`)), priority: 6, minWidth: 116 });
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
          detail: detailOf(t, data, row, now),
        };
      }),
      footer: unread > 0 ? t(k(`unread`), { count: unread }) : undefined,
    },
    deadlines: views.flatMap(({ row, severity }) => deadlinesOf(t, row, severity, now)),
    summary: t(k(`summary`), { count: rows.length, reinforced }),
  };
};
