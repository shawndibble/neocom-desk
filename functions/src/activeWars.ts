import { isFiniteNumber, isRecord } from './guards.js';

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

export interface SweepState {
  topId?: number;
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
  newIds: number[];
  openIds: number[];
  seedIds: number[];
}

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
