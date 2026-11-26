import type { CandidateRack } from '@/engine/fittings/candidates';
import { skillsKey, unpackCheck } from '@/engine/fittings/hullFitKey';
import type { PilotProfile } from '@/engine/fittings/types';
import type { CandidateCheck, DogmaEngine } from './dogmaFittingEngine';
import type { FittingContext } from './fittingContext';
import { loadSavedHullFit, saveHullFit } from './hullFitCache';
import { sendToWorker } from './fittingWorker';
import type { HullFitRequest } from './hullFit.worker';
import type { FittingCatalogue } from './useFittingCatalogue';

export type HullFitChecks = ReadonlyMap<number, CandidateCheck>;

const RESULT_VERSION = 2;
const BATCH = 50;
const SLICE_MS = 12;
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

function hullFitKey(catalogue: FittingCatalogue, shipTypeId: number, profile: PilotProfile) {
  return [
    RESULT_VERSION,
    __DOGMA_PINS__,
    catalogueFingerprint(catalogue),
    shipTypeId,
    skillsKey(profile.skillLevels),
  ].join('|');
}

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

function computeInWorker(
  shipTypeId: number,
  jobs: [CandidateRack, number[]][],
  profile: PilotProfile
): Promise<HullFitChecks> | null {
  const reply = sendToWorker((id): HullFitRequest => ({
    id,
    shipTypeId,
    jobs,
    skillLevels: [...profile.skillLevels],
  }));
  return (
    reply &&
    reply.then((answer) => {
      if (!('entries' in answer)) throw new Error('unexpected reply');
      return new Map(answer.entries.map(([typeId, bits]) => [typeId, unpackCheck(bits)]));
    })
  );
}

function computeOnPage(
  engine: DogmaEngine,
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
        for (const [id, check] of engine.checkCandidates(shipTypeId, rack, ids, profile)) {
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
  { engine, catalogue, profile }: FittingContext,
  shipTypeId: number
): Promise<HullFitChecks> {
  const jobs = jobsFor(catalogue);
  const inWorker = computeInWorker(shipTypeId, jobs, profile);
  if (inWorker) {
    try {
      return await inWorker;
    } catch (error) {
      if (error instanceof Error && error.message === 'superseded') throw error;
    }
  }
  return computeOnPage(engine, shipTypeId, jobs, profile);
}

export function getHullFit(context: FittingContext, shipTypeId: number): Promise<HullFitChecks> {
  const key = hullFitKey(context.catalogue, shipTypeId, context.profile);
  const known = memory.get(key);
  if (known) {
    memory.delete(key);
    memory.set(key, known);
    return Promise.resolve(known);
  }
  const existing = running.get(key);
  if (existing) return existing;

  const run = (async () => {
    const saved = await loadSavedHullFit(key);
    const checks = saved ?? (await compute(context, shipTypeId));
    if (!saved) void saveHullFit(key, checks);
    memory.set(key, checks);
    if (memory.size > MEMORY_HULLS) memory.delete(memory.keys().next().value!);
    return checks;
  })().finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

export function clearHullFitMemory(): void {
  memory.clear();
}
