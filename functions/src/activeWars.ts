/**
 * The open-wars list for the War banner (`active-wars/wars.json` in R2), with
 * no I/O in it. ESI cannot list one corporation's wars, so the active-wars job
 * keeps every war that is still running and the app picks its own out of the
 * list (`src/engine/wars.ts`, which reads this shape).
 *
 * Finding them: `/wars` is a newest-first list of ids (about 26 a day) and
 * `/wars/{id}` one war, rate limited to 3,600 tokens per 15 minutes. So a run:
 *
 * - reads every id above the newest one it already saw,
 * - re-reads the wars it holds open (that is how an end, or a war ESI dropped,
 *   is noticed),
 * - spends what is left of its budget seeding downward from the newest id,
 *   toward `ACTIVE_WARS_HORIZON_IDS` ids back (about 15 months).
 *
 * Seeding newest-first means the first run already covers the last couple of
 * months, where nearly every open war is; older ones fill in over the next runs.
 * Only a war that began before the horizon and never ended is missed, and the
 * Alerts feed still catches a new declaration.
 */

import { isFiniteNumber, isRecord } from './guards.js';

/** How far back (in war ids, about 26 a day) the sweep looks for a war that is still open. */
export const ACTIVE_WARS_HORIZON_IDS = 12_000;

export interface WarParty {
  corporationId?: number;
  allianceId?: number;
  iskDestroyed: number;
  shipsKilled: number;
}

export interface WarAlly {
  corporationId?: number;
  allianceId?: number;
}

/** The shape `src/engine/wars.ts` reads. Times are epoch ms. */
export interface StoredWar {
  id: number;
  declared: number;
  started?: number;
  finished?: number;
  mutual: boolean;
  openForAllies: boolean;
  aggressor: WarParty;
  defender: WarParty;
  allies: WarAlly[];
}

/** Where the last run got to, kept in the same doc as the list. */
export interface SweepState {
  /** Every listed id above this one has been read. */
  topId?: number;
  /** Every listed id from the newest down to this one has been read. */
  floorId?: number;
}

const num = (value: unknown): number | undefined => (isFiniteNumber(value) ? value : undefined);

function time(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function entity(value: Record<string, unknown>): { corporationId?: number; allianceId?: number } {
  const corporationId = num(value.corporation_id);
  const allianceId = num(value.alliance_id);
  return {
    ...(corporationId === undefined ? {} : { corporationId }),
    ...(allianceId === undefined ? {} : { allianceId }),
  };
}

function party(value: unknown): WarParty | null {
  if (!isRecord(value)) return null;
  return {
    ...entity(value),
    iskDestroyed: num(value.isk_destroyed) ?? 0,
    shipsKilled: num(value.ships_killed) ?? 0,
  };
}

/** One `GET /wars/{id}` body as a stored war, or null when it is not one. */
export function parseEsiWar(body: unknown): StoredWar | null {
  if (!isRecord(body)) return null;
  const id = num(body.id);
  const declared = time(body.declared);
  const aggressor = party(body.aggressor);
  const defender = party(body.defender);
  if (id === undefined || declared === undefined || aggressor === null || defender === null) {
    return null;
  }
  const started = time(body.started);
  const finished = time(body.finished);
  const allies = Array.isArray(body.allies)
    ? body.allies.filter(isRecord).map((ally) => entity(ally))
    : [];
  return {
    id,
    declared,
    ...(started === undefined ? {} : { started }),
    ...(finished === undefined ? {} : { finished }),
    mutual: body.mutual === true,
    openForAllies: body.open_for_allies === true,
    aggressor,
    defender,
    allies,
  };
}

export interface SweepPlan {
  /** Ids newer than anything read before. */
  newIds: number[];
  /** Wars held open, read again. */
  openIds: number[];
  /** Older ids, newest first, read to extend how far back the list reaches. */
  seedIds: number[];
}

/**
 * What to read this run. `listed` is the ids `/wars` returned, newest first,
 * reaching at least back to the horizon. New and open ids are always read;
 * `budget` is the whole run's allowance and only the seeding is cut to fit it.
 */
export function planSweep(
  listed: readonly number[],
  state: SweepState,
  openIds: readonly number[],
  budget: number
): SweepPlan {
  const newest = listed[0];
  if (newest === undefined) return { newIds: [], openIds: [], seedIds: [] };
  const topId = state.topId ?? newest + 1;
  const floorId = state.floorId ?? newest + 1;
  const newIds = listed.filter((id) => id > topId);
  const fresh = new Set(newIds);
  const reread = [...new Set(openIds)].filter((id) => !fresh.has(id));
  const seedBudget = Math.max(0, budget - newIds.length - reread.length);
  const reach = newest - ACTIVE_WARS_HORIZON_IDS;
  const seedIds = listed.filter((id) => id < floorId && id > reach).slice(0, seedBudget);
  return { newIds, openIds: reread, seedIds };
}

/**
 * Where the next run starts. `done` holds every id that was read or that ESI
 * said does not exist. The top only moves up when every new id is done, and the
 * floor only moves down through an unbroken run of done seed ids, so a failed
 * read is simply tried again.
 */
export function advanceSweep(
  listed: readonly number[],
  state: SweepState,
  plan: SweepPlan,
  done: ReadonlySet<number>
): SweepState {
  const newest = listed[0];
  if (newest === undefined) return state;
  const topId = plan.newIds.every((id) => done.has(id)) ? newest : state.topId;
  let floorId = state.floorId ?? newest + 1;
  for (const id of plan.seedIds) {
    if (!done.has(id)) break;
    floorId = id;
  }
  return { ...(topId === undefined ? {} : { topId }), floorId };
}

/**
 * The open list after a run: what was held, with every re-read war replaced,
 * new ones added, `removedIds` (ESI no longer has them) dropped, and anything
 * that has finished left out. Newest declared first, so an unchanged list
 * serializes the same way.
 */
export function mergeOpenWars(
  held: readonly StoredWar[],
  fetched: readonly StoredWar[],
  removedIds: readonly number[],
  now: number
): StoredWar[] {
  const byId = new Map(held.map((war) => [war.id, war]));
  for (const id of removedIds) byId.delete(id);
  for (const war of fetched) byId.set(war.id, war);
  return [...byId.values()]
    .filter((war) => war.finished === undefined || war.finished > now)
    .sort((a, b) => b.declared - a.declared || b.id - a.id);
}
