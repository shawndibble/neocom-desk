/**
 * Body of `syncActiveWars` (see its doc in index.ts): reads ESI's war list and
 * the wars it holds open, and writes the result to `systemConditions/activeWars`.
 * The planning is `activeWars.ts`; this is the fetching, with `read`, `write`
 * and `fetchImpl` injected so it runs against fakes.
 */
import { info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import {
  ACTIVE_WARS_DOC,
  ACTIVE_WARS_HORIZON_IDS,
  advanceSweep,
  mergeOpenWars,
  parseEsiWar,
  planSweep,
  type StoredWar,
  type SweepState,
} from './activeWars.js';
import { ESI_BASE, ESI_COMPATIBILITY_DATE, ESI_USER_AGENT } from './esiNotifications.js';
import { firestore } from './firestore.js';
import { SYSTEM_CONDITIONS_COLLECTION } from './lawlessSystems.js';

/** Detail reads in one run. Each costs 2 of the 3,600 tokens ESI gives this route per 15 minutes. */
export const ACTIVE_WARS_RUN_BUDGET = 1500;
/** Stop reading when ESI says this few tokens are left, so the window is never emptied. */
const MIN_TOKENS_LEFT = 300;
const CONCURRENCY = 8;
/** Share of held wars that must read again for `updatedAt` to move. */
const OPEN_CONFIRMED_SHARE = 0.95;
/** Open wars past this and one doc, or one run's reads, start to strain. */
const OPEN_WARS_WARN_AT = 1000;
/** `/wars` pages are 2,000 ids, so the horizon is about six. */
const MAX_LIST_PAGES = 10;

export interface ActiveWarsDoc extends SweepState {
  updatedAt?: number;
  wars?: unknown;
}

export interface ActiveWarsDeps {
  fetchImpl: typeof fetch;
  read: () => Promise<ActiveWarsDoc | undefined>;
  write: (
    doc: Required<Pick<ActiveWarsDoc, 'updatedAt'>> & { wars: StoredWar[] } & SweepState
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

const headers = {
  'User-Agent': ESI_USER_AGENT,
  'X-User-Agent': ESI_USER_AGENT,
  'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
  Accept: 'application/json',
};

/** Every war id back to the horizon, newest first; null when ESI would not say. */
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
          // A body that is not a war will not be one next run either: done, not stored.
          const war = parseEsiWar(await res.json().catch(() => null));
          if (war !== null) fetched.push(war);
          done.add(id);
        }
      } catch {
        // A failed read is left undone: the next run tries it again.
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const at = now();
  const wars = mergeOpenWars(held, fetched, removed, at);
  const next = advanceSweep(listed, state, plan, done);
  // The list is "confirmed now" when nearly every war it holds was read again,
  // so one war ESI will not serve cannot freeze the list for everyone; an
  // outage or a spent rate window reads few and does not confirm. A new id that
  // would not read is retried next run and does not age the rest.
  const openRead = plan.openIds.filter((id) => done.has(id)).length;
  const openConfirmed = openRead >= plan.openIds.length * OPEN_CONFIRMED_SHARE;
  const updatedAt = openConfirmed ? at : (doc?.updatedAt ?? 0);
  await deps.write({ updatedAt, wars, ...next });
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

/** Body of syncActiveWars (see its doc in index.ts). */
export async function runSyncActiveWars(): Promise<void> {
  const ref = firestore().collection(SYSTEM_CONDITIONS_COLLECTION).doc(ACTIVE_WARS_DOC);
  await runActiveWarsSweep({
    fetchImpl: fetch,
    read: async () => (await ref.get()).data() as ActiveWarsDoc | undefined,
    write: async (doc) => {
      await ref.set(doc);
    },
    now: Date.now,
  });
}
