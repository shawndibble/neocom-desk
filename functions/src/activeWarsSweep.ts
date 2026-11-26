import { info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import {
  ACTIVE_WARS_HORIZON_IDS,
  advanceSweep,
  mergeOpenWars,
  parseEsiWar,
  planSweep,
  type StoredWar,
  type SweepState,
} from './activeWars.js';
import { ESI_BASE, esiHeaders } from './esiClient.js';

export const ACTIVE_WARS_RUN_BUDGET = 1500;
const MIN_TOKENS_LEFT = 300;
const CONCURRENCY = 8;
const OPEN_CONFIRMED_SHARE = 0.95;
const OPEN_WARS_WARN_AT = 1000;
const MAX_LIST_PAGES = 10;

export interface ActiveWarsDoc extends SweepState {
  updatedAt?: number;
  wars?: unknown;
}

export interface ActiveWarsDeps {
  fetchImpl: typeof fetch;
  read: () => Promise<ActiveWarsDoc | undefined>;
  write: (
    doc: Required<Pick<ActiveWarsDoc, 'updatedAt'>> & { wars: StoredWar[] } & SweepState,
    progress: { complete: boolean }
  ) => Promise<void>;
  now: () => number;
  budget?: number;
}

export interface ActiveWarsOutcome {
  written: boolean;
  open: number;
  read: number;
  failed: number;
  floorId?: number;
}

const headers = esiHeaders();

async function listWarIds(fetchImpl: typeof fetch): Promise<number[] | null> {
  const ids: number[] = [];
  let maxWarId: number | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const url = `${ESI_BASE}/wars/${maxWarId === undefined ? '' : `?max_war_id=${maxWarId}`}`;
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!Array.isArray(body) || !body.every((id): id is number => typeof id === 'number')) {
      return null;
    }
    if (body.length === 0) break;
    ids.push(...body);
    const oldest = body[body.length - 1] as number;
    if (oldest <= (ids[0] as number) - ACTIVE_WARS_HORIZON_IDS || body.length < 2000) break;
    maxWarId = oldest;
  }
  return ids;
}

function heldWars(value: unknown): StoredWar[] {
  return Array.isArray(value)
    ? value.filter(
        (war): war is StoredWar => typeof war?.id === 'number' && typeof war?.declared === 'number'
      )
    : [];
}

export async function runActiveWarsSweep(deps: ActiveWarsDeps): Promise<ActiveWarsOutcome | null> {
  const { fetchImpl, now } = deps;
  const doc = await deps.read();
  const held = heldWars(doc?.wars);
  const state: SweepState = {
    ...(typeof doc?.topId === 'number' ? { topId: doc.topId } : {}),
    ...(typeof doc?.floorId === 'number' ? { floorId: doc.floorId } : {}),
  };

  const listed = await listWarIds(fetchImpl).catch(() => null);
  if (listed === null || listed.length === 0) {
    logWarn('active wars: could not read the war list; nothing written');
    return null;
  }

  const plan = planSweep(
    listed,
    state,
    held.map((war) => war.id),
    deps.budget ?? ACTIVE_WARS_RUN_BUDGET
  );
  const queue = [...plan.newIds, ...plan.openIds, ...plan.seedIds];
  const done = new Set<number>();
  const fetched: StoredWar[] = [];
  const removed: number[] = [];
  let stop = false;

  async function worker(): Promise<void> {
    for (let id = queue.shift(); id !== undefined && !stop; id = queue.shift()) {
      try {
        const res = await fetchImpl(`${ESI_BASE}/wars/${id}/`, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        const left = Number(res.headers.get('x-ratelimit-remaining'));
        if (
          res.status === 420 ||
          res.status === 429 ||
          (res.headers.has('x-ratelimit-remaining') && left < MIN_TOKENS_LEFT)
        ) {
          stop = true;
        }
        if (res.status === 404 || res.status === 410) {
          done.add(id);
          removed.push(id);
        } else if (res.ok) {
          const war = parseEsiWar(await res.json().catch(() => null));
          if (war !== null) fetched.push(war);
          done.add(id);
        }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const at = now();
  const wars = mergeOpenWars(held, fetched, removed, at);
  const next = advanceSweep(listed, state, plan, done);
  const openRead = plan.openIds.filter((id) => done.has(id)).length;
  const openConfirmed = openRead >= plan.openIds.length * OPEN_CONFIRMED_SHARE;
  const updatedAt = openConfirmed ? at : (doc?.updatedAt ?? 0);
  const reach = listed[0] - ACTIVE_WARS_HORIZON_IDS;
  const complete = !listed.some((id) => id > reach && id < (next.floorId ?? Infinity));
  await deps.write({ updatedAt, wars, ...next }, { complete });
  const outcome: ActiveWarsOutcome = {
    written: true,
    open: wars.length,
    read: done.size,
    failed: plan.newIds.length + plan.openIds.length + plan.seedIds.length - done.size,
    ...(next.floorId === undefined ? {} : { floorId: next.floorId }),
  };
  if (wars.length > OPEN_WARS_WARN_AT) {
    logWarn('active wars: the open list is large for one doc and one run', { open: wars.length });
  }
  logInfo('active wars sweep', { ...outcome, openConfirmed });
  return outcome;
}
