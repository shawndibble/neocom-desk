/**
 * The Starbases widget (issue #4610) and the adapter that lends its clocks to
 * Due soon. Same contract as `models.ts`: pure, derived at render time.
 *
 * ESI gives a tower's fuel quantity but not its burn rate, so hours of fuel
 * come from the static data (`engine/corp/starbases.ts`). A tower whose type
 * has no rate, or whose bay could not be read, shows what is known and no
 * dry-run time. Fuel is read at most once an hour (the corp cache window), so
 * no figure under that is ticked down.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { BoardStarbaseSource } from '@/engine/corp/board';
import { STARBASE_FUEL_WARNING_HOURS, fuelHoursLeft } from '@/engine/corp/starbases';
import { formatCountdown } from '@/lib/duration';
import { formatNumber } from '@/lib/numberLocale';
import { CORP_CACHE_WINDOW_MS } from '../../data/corpCards';
import {
  blank,
  corpUnreadable,
  count,
  detailToneOf,
  statusOf,
  UNKNOWN,
  type Builder,
} from './builderKit';
import type { CorpStarbaseRow, CorpStarbasesFeed } from './corpFeeds';
import type { NumberSecondary, RowDetailModel, TableRowModel } from './types';
import type { Translate } from '@/lib/translate';

const W = 'overview.widgets.corpStarbases';
const HOUR_MS = 3_600_000;
const KNOWN_STATES = new Set(['offline', 'online', 'onlining', 'reinforced', 'unanchoring']);

/** When the fuel runs out, from the moment this tower's bay was read; null when it cannot be told. */
function fuelExpiresMs(row: CorpStarbaseRow, fallbackReadAtMs: number): number | null {
  if (row.state !== 'online' || row.bay === null) return null;
  const hours = fuelHoursLeft(row.typeId, row.bay.fuelBlocks);
  return hours === null ? null : (row.bayReadAtMs ?? fallbackReadAtMs) + hours * HOUR_MS;
}

/** Due soon's view of the towers: each fuel clock and each reinforcement or unanchor timer. */
export function toBoardStarbases(feed: CorpStarbasesFeed, nowMs: number): BoardStarbaseSource[] {
  const readAtMs = feed.fetchedAt?.getTime() ?? nowMs;
  return feed.starbases.map((row) => ({
    starbaseId: row.starbaseId,
    name: towerName(feed, row),
    fuelExpiresMs: fuelExpiresMs(row, readAtMs),
    reinforcedUntilMs: row.reinforcedUntilMs,
    unanchorsAtMs: row.unanchorsAtMs,
  }));
}

function towerName(feed: CorpStarbasesFeed, row: CorpStarbaseRow): string {
  const system = feed.systemNames.get(row.systemId);
  const type = feed.typeNames.get(row.typeId) ?? `#${row.typeId}`;
  // A tower has no name of its own, and " - " would be cut as a structure's system prefix.
  return system === undefined ? type : `${type} (${system})`;
}

interface Tower {
  row: CorpStarbaseRow;
  system: string;
  type: string;
  /** Epoch ms the fuel runs out; null when unknowable. */
  expiresMs: number | null;
  tone: DeadlineSeverity;
}

/** A countdown that never claims more precision than the hour-old read behind it. */
function untilText(t: Translate, remainingMs: number): string {
  if (remainingMs <= 0) return t('corp.board.dry');
  return remainingMs < CORP_CACHE_WINDOW_MS
    ? t('corp.board.underCacheWindow')
    : formatCountdown(remainingMs / 1000);
}

function fuelTone(remainingMs: number | null): DeadlineSeverity {
  if (remainingMs === null) return 'clear';
  if (remainingMs <= 0) return 'critical';
  return remainingMs < STARBASE_FUEL_WARNING_HOURS * HOUR_MS ? 'warning' : 'clear';
}

export const corpStarbases: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpStarbases;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  if (!data.readable) return corpUnreadable(null, feed, data.needsReauth, t);

  const readAtMs = data.fetchedAt?.getTime() ?? now;
  const towers = data.starbases
    .map((row): Tower => {
      const expiresMs = fuelExpiresMs(row, readAtMs);
      const remainingMs = expiresMs === null ? null : expiresMs - now;
      return {
        row,
        system: data.systemNames.get(row.systemId) ?? UNKNOWN,
        type: data.typeNames.get(row.typeId) ?? `#${row.typeId}`,
        expiresMs,
        tone: worstSeverity([
          fuelTone(remainingMs),
          row.state === 'reinforced' ? 'warning' : 'clear',
        ]),
      };
    })
    // Soonest dry first; towers with no fuel clock after them, by name.
    .sort(
      (a, b) =>
        (a.expiresMs ?? Infinity) - (b.expiresMs ?? Infinity) ||
        a.system.localeCompare(b.system) ||
        a.type.localeCompare(b.type) ||
        a.row.starbaseId - b.row.starbaseId
    );

  const lowest = towers.find((tower) => tower.expiresMs !== null);
  const secondary: NumberSecondary | undefined = lowest
    ? {
        text: t(`${W}.lowest`, {
          name: lowest.system,
          duration: untilText(t, (lowest.expiresMs ?? now) - now),
        }),
      }
    : undefined;

  const stateText = (state: string) =>
    KNOWN_STATES.has(state) ? t(`${W}.state.${state}`) : state.replace(/_/g, ' ');
  const fuelText = (tower: Tower): string => {
    const { bay } = tower.row;
    if (bay === null) return UNKNOWN;
    const blocks = formatNumber(bay.fuelBlocks);
    return tower.expiresMs === null
      ? blocks
      : t(`${W}.fuelCell`, { blocks, duration: untilText(t, tower.expiresMs - now) });
  };
  const strontiumText = (tower: Tower) =>
    tower.row.bay === null ? UNKNOWN : formatNumber(tower.row.bay.strontium);
  const reinforceText = (tower: Tower) => {
    const until = tower.row.reinforcedUntilMs;
    if (until === null) return UNKNOWN;
    // A passed timer is over, which is not the tower being out of fuel.
    return until <= now ? t(`${W}.reinforceEnded`) : untilText(t, until - now);
  };

  const detailOf = (tower: Tower): RowDetailModel => {
    const { row } = tower;
    return {
      title: tower.type,
      status: { badge: stateText(row.state), tone: detailToneOf(tower.tone) },
      facts: [
        { label: t(`${W}.col.system`), value: tower.system },
        { label: t(`${W}.col.fuel`), value: fuelText(tower) },
        { label: t(`${W}.col.strontium`), value: strontiumText(tower) },
        { label: t(`${W}.col.reinforced`), value: reinforceText(tower) },
      ],
      place: data.systemNames.has(row.systemId)
        ? { systemId: row.systemId, name: tower.system }
        : undefined,
    };
  };

  const lowFuel = towers.filter(
    (tower) => tower.expiresMs !== null && fuelTone(tower.expiresMs - now) !== 'clear'
  ).length;

  return {
    ...blank(null, statusOf(feed, { isEmpty: towers.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(towers.length),
      unit: t(`${W}.unit`),
      secondary,
      notes:
        lowFuel > 0
          ? [t(`${W}.lowFuel`, { count: lowFuel, hours: STARBASE_FUEL_WARNING_HOURS })]
          : undefined,
      tone: worstSeverity(towers.map((tower) => tower.tone)),
    },
    rows: towers.map((tower) => ({
      key: String(tower.row.starbaseId),
      title: tower.system,
      detail: `${tower.type} · ${stateText(tower.row.state)}`,
      value: fuelText(tower),
      tone: tower.tone,
    })),
    table: {
      columns: [
        { key: 'tower', label: t(`${W}.col.tower`), priority: 0 },
        { key: 'system', label: t(`${W}.col.system`), priority: 1 },
        { key: 'state', label: t(`${W}.col.state`), priority: 2, hideNarrow: true },
        { key: 'fuel', label: t(`${W}.col.fuel`), align: 'end', priority: 1 },
        {
          key: 'strontium',
          label: t(`${W}.col.strontium`),
          align: 'end',
          priority: 3,
          hideNarrow: true,
        },
        {
          key: 'reinforced',
          label: t(`${W}.col.reinforced`),
          align: 'end',
          priority: 2,
          hideNarrow: true,
        },
      ],
      rows: towers.map((tower): TableRowModel => ({
        key: String(tower.row.starbaseId),
        cells: [
          tower.type,
          tower.system,
          stateText(tower.row.state),
          fuelText(tower),
          strontiumText(tower),
          reinforceText(tower),
        ],
        tone: tower.tone,
        detail: detailOf(tower),
      })),
    },
    summary: t(`${W}.summary`, { count: towers.length, low: lowFuel }),
  };
};
