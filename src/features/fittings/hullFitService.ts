/**
 * The module browser's whole-catalogue hull check as one shared service
 * (`useHullFit` is its only caller). For a hull and a pilot's skills it
 * answers from memory, else from the saved row (`hullFitCache`), else works
 * it out — in a Web Worker where the browser has one, in slices on the page
 * otherwise (jsdom, old browsers) — and keeps one run per key, so the
 * route's background warm-up and the Add panel share a single computation.
 * Call it only once the page's own engine is ready: the worker then reads the
 * engine assets from Cache Storage instead of racing the page to download
 * them.
 */
import type { CandidateRack } from '@/engine/fittings/candidates';
import { skillsKey, unpackCheck } from '@/engine/fittings/hullFitKey';
import type { PilotProfile } from '@/engine/fittings/types';
import { checkCandidates, type CandidateCheck } from './dogmaFittingEngine';
import { loadSavedHullFit, saveHullFit } from './hullFitCache';
import type { HullFitReply, HullFitRequest } from './hullFit.worker';
import type { FittingCatalogue } from './useFittingCatalogue';

export type HullFitChecks = ReadonlyMap<number, CandidateCheck>;

/** Bump when what a saved check means changes without the engine pins doing so (`HULL_RULES`, the pre-filter, the packing). */
const RESULT_VERSION = 2;
/** Ids per engine call on the page; small enough that one slice stays well under a frame. */
const BATCH = 50;
/** How long one slice on the page may run before yielding. */
const SLICE_MS = 12;
/** Hulls kept in memory. */
const MEMORY_HULLS = 8;

const RACK_CODE: Record<CandidateRack, number> = {
  high: 1,
  medium: 2,
  low: 3,
  rig: 4,
  subsystem: 5,
  drone: 6,
};
const fingerprints = new WeakMap<FittingCatalogue, string>();

/** The items and racks the check runs over, as a short text: a data rebuild changes it. */
function catalogueFingerprint(catalogue: FittingCatalogue): string {
  let known = fingerprints.get(catalogue);
  if (known === undefined) {
    let hash = 0;
    for (const entry of catalogue.marketTypes) {
      const rack = catalogue.rackOf[String(entry.typeId)];
      hash = (Math.imul(hash, 31) + entry.typeId * 8 + (rack ? RACK_CODE[rack] : 0)) | 0;
    }
    known = `${catalogue.marketTypes.length}.${(hash >>> 0).toString(36)}`;
    fingerprints.set(catalogue, known);
  }
  return known;
}

/** Everything a saved answer is valid for. */
function hullFitKey(catalogue: FittingCatalogue, shipTypeId: number, profile: PilotProfile) {
  return [
    RESULT_VERSION,
    __DOGMA_PINS__,
    catalogueFingerprint(catalogue),
    shipTypeId,
    skillsKey(profile.skillLevels),
  ].join('|');
}

/** Every fittable market item, by rack. */
function jobsFor(catalogue: FittingCatalogue): [CandidateRack, number[]][] {
  const byRack = new Map<CandidateRack, number[]>();
  for (const entry of catalogue.marketTypes) {
    const rack = catalogue.rackOf[String(entry.typeId)];
    if (rack === undefined) continue;
    const ids = byRack.get(rack) ?? [];
    ids.push(entry.typeId);
    byRack.set(rack, ids);
  }
  return [...byRack];
}

const memory = new Map<string, HullFitChecks>();
const running = new Map<string, Promise<HullFitChecks>>();

let worker: Worker | null = null;
let workerBroken = false;
let nextRequest = 0;
const pending = new Map<
  number,
  { resolve: (checks: HullFitChecks) => void; reject: (reason: Error) => void }
>();

function failPending(reason: Error) {
  for (const { reject } of pending.values()) reject(reason);
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./hullFit.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<HullFitReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('entries' in reply) {
      waiting.resolve(new Map(reply.entries.map(([typeId, bits]) => [typeId, unpackCheck(bits)])));
    } else {
      waiting.reject(new Error('aborted' in reply ? 'superseded' : reply.error));
    }
  };
  worker.onerror = () => {
    workerBroken = true;
    worker = null;
    failPending(new Error('worker failed'));
  };
  return worker;
}

function computeInWorker(
  target: Worker,
  shipTypeId: number,
  jobs: [CandidateRack, number[]][],
  profile: PilotProfile
): Promise<HullFitChecks> {
  const id = ++nextRequest;
  const request: HullFitRequest = {
    id,
    shipTypeId,
    jobs,
    skillLevels: [...profile.skillLevels],
  };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage(request);
  });
}

/** The page's own path: every item through the memoizing engine call, in slices that yield. */
function computeOnPage(
  shipTypeId: number,
  jobs: [CandidateRack, number[]][],
  profile: PilotProfile
): Promise<HullFitChecks> {
  const slices: [CandidateRack, number[]][] = [];
  for (const [rack, ids] of jobs) {
    for (let i = 0; i < ids.length; i += BATCH) slices.push([rack, ids.slice(i, i + BATCH)]);
  }
  const checks = new Map<number, CandidateCheck>();
  let next = 0;
  return new Promise((resolve) => {
    const slice = () => {
      const until = performance.now() + SLICE_MS;
      while (next < slices.length && performance.now() < until) {
        const [rack, ids] = slices[next++];
        for (const [id, check] of checkCandidates(shipTypeId, rack, ids, profile)) {
          checks.set(id, check);
        }
      }
      if (next < slices.length) setTimeout(slice, 0);
      else resolve(checks);
    };
    setTimeout(slice, 0);
  });
}

async function compute(
  catalogue: FittingCatalogue,
  shipTypeId: number,
  profile: PilotProfile
): Promise<HullFitChecks> {
  const jobs = jobsFor(catalogue);
  const target = ensureWorker();
  if (target) {
    try {
      return await computeInWorker(target, shipTypeId, jobs, profile);
    } catch (error) {
      // Asked about another hull meanwhile: the caller has moved on too.
      if (error instanceof Error && error.message === 'superseded') throw error;
    }
  }
  return computeOnPage(shipTypeId, jobs, profile);
}

/**
 * Which items go on this hull, and which the pilot can fly. Rejects with
 * `superseded` if a newer hull was asked for while the worker was still on
 * this one; the caller has moved on and should ignore it.
 */
export function getHullFit(
  catalogue: FittingCatalogue,
  shipTypeId: number,
  profile: PilotProfile
): Promise<HullFitChecks> {
  const key = hullFitKey(catalogue, shipTypeId, profile);
  const known = memory.get(key);
  if (known) {
    // Most recently used last, so the oldest goes first.
    memory.delete(key);
    memory.set(key, known);
    return Promise.resolve(known);
  }
  const existing = running.get(key);
  if (existing) return existing;

  const run = (async () => {
    const saved = await loadSavedHullFit(key);
    const checks = saved ?? (await compute(catalogue, shipTypeId, profile));
    if (!saved) void saveHullFit(key, checks);
    memory.set(key, checks);
    if (memory.size > MEMORY_HULLS) memory.delete(memory.keys().next().value!);
    return checks;
  })().finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

/** Forgets what is held in memory (the saved rows stay) — for tests. */
export function clearHullFitMemory(): void {
  memory.clear();
}
