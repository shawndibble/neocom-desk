import wasmInit, {
  calculate,
  load_sde,
  type Fit,
  type FitItem,
  type Violation,
} from '@eveshipfit/dogma-engine';
import { classifyRuleBreaks, type CandidateRack } from '@/engine/fittings/candidates';
import { fittingToDogmaFit } from '@/engine/fittings/fitMapper';
import {
  extractFittingStats,
  extractModuleResult,
  extractOffense,
  extractOverheatedStats,
  type OffenseItem,
} from '@/engine/fittings/stats';
import {
  ITEM_DOGMA_ATTRIBUTE,
  type Fitting,
  type FittingSlotKind,
  type FittingStats,
  type PilotProfile,
  type DamageProfile,
} from '@/engine/fittings/types';

/**
 * ADR 0016's "one seam module": the only place `@eveshipfit/dogma-engine` is
 * imported. Everything else (`src/engine/fittings/*`) works with plain
 * `Fitting`/`PilotProfile`/`FittingStats` shapes, so swapping the engine
 * later means rewriting this file, not its callers.
 */

const WASM_URL = '/vendor/dogma/esf_dogma_engine_bg.wasm';
const SDE_URL = '/vendor/dogma/sde.dat';

/**
 * Bump whenever `@eveshipfit/dogma-engine` or `@eveshipfit/sde` is bumped in
 * `package.json` (ADR 0016: the two are pinned and bumped together). The
 * fetch URLs above never change, so without this a browser that already
 * cached the old files under the old cache name would keep serving them
 * forever — this forces a fresh `caches.open` bucket, and hence a fresh
 * fetch, on the next bump.
 */
const CACHE_VERSION = 1;
const CACHE_NAME = `dogma-engine-assets-v${CACHE_VERSION}`;

export interface DogmaAssetProgress {
  loadedBytes: number;
  /** Null until both downloads' `Content-Length` are known. */
  totalBytes: number | null;
}

async function fetchWithProgress(
  url: string,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void
): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  const response = cached ?? (await fetch(url));
  if (!cached && response.ok) await cache.put(url, response.clone());

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : null;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    onProgress(buffer.byteLength, totalBytes ?? buffer.byteLength);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress(loadedBytes, totalBytes);
  }
  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

let enginePromise: Promise<void> | null = null;
let engineReady = false;

/** True once `loadDogmaEngine` has resolved — the fit checks below are synchronous and need it. */
export function isDogmaEngineReady(): boolean {
  return engineReady;
}

/**
 * Loads the WASM engine and its pinned SDE snapshot, lazily and once
 * (ADR 0016): fetched only the first time a caller asks, excluded from the
 * app-shell precache (`vite.config.ts`'s `globIgnores`), and cached here via
 * the Cache Storage API so a repeat visit — including offline — reuses them
 * instead of refetching. `onProgress` reports combined bytes across both
 * downloads as they stream in; a warm cache still reports 0 -> total almost
 * immediately, since a `cache.match` hit skips the network but not this
 * function's own byte counting.
 */
export function loadDogmaEngine(
  onProgress?: (progress: DogmaAssetProgress) => void
): Promise<void> {
  if (!enginePromise) {
    enginePromise = (async () => {
      let wasmLoaded = 0;
      let sdeLoaded = 0;
      let wasmTotal: number | null = null;
      let sdeTotal: number | null = null;
      const report = () => {
        const totalBytes = wasmTotal === null || sdeTotal === null ? null : wasmTotal + sdeTotal;
        onProgress?.({ loadedBytes: wasmLoaded + sdeLoaded, totalBytes });
      };

      const [wasmBytes, sdeBytes] = await Promise.all([
        fetchWithProgress(WASM_URL, (loaded, total) => {
          wasmLoaded = loaded;
          wasmTotal = total;
          report();
        }),
        fetchWithProgress(SDE_URL, (loaded, total) => {
          sdeLoaded = loaded;
          sdeTotal = total;
          report();
        }),
      ]);

      await wasmInit({ module_or_path: wasmBytes });
      load_sde(new Uint8Array(sdeBytes));
      engineReady = true;
    })().catch((error: unknown) => {
      // A failed load (offline on first visit, a bad response, …) must not
      // wedge every later attempt behind the same rejected promise.
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

/**
 * Works out a Fitting's stats under a pilot's skills and implants, with EHP
 * measured against `damageProfile` (the engine's uniform default without
 * one). Loads the engine first if this is the first call anywhere in the
 * session.
 */
export async function computeFittingStats(
  fitting: Fitting,
  profile: PilotProfile,
  onProgress?: (progress: DogmaAssetProgress) => void,
  damageProfile?: DamageProfile,
  { overheated: withOverheated = true }: { overheated?: boolean } = {}
): Promise<FittingStats> {
  await loadDogmaEngine(onProgress);
  const dogmaFit = fittingToDogmaFit(fitting, profile, damageProfile);
  const calculation = calculate(dogmaFit);
  const baseStats = extractFittingStats(
    dogmaFit.items.map((item) => item.type_id),
    calculation.ship.attributes,
    calculation.items
  );

  // Calibration and drone bandwidth have no single ship-level "used" id the
  // way cpuFree/powerFree do (see types.ts's DOGMA_ATTRIBUTE doc comment) —
  // summed here instead, since only this seam has both `dogmaFit.items`'
  // slot types and `calculation.items`' per-item attribute values. A drone
  // stack only draws bandwidth while deployed ('active'); one sitting in the
  // bay ('online') draws none.
  let calibrationUsed = 0;
  let droneBandwidthUsed = 0;
  dogmaFit.items.forEach((item, index) => {
    const itemAttributes = calculation.items[index]?.attributes;
    if (!itemAttributes) return;
    if (item.slot.type === 'rig') {
      calibrationUsed += itemAttributes.get(ITEM_DOGMA_ATTRIBUTE.calibrationCost)?.value ?? 0;
    } else if (item.slot.type === 'drone_bay' && item.state === 'active') {
      const perDrone = itemAttributes.get(ITEM_DOGMA_ATTRIBUTE.droneBandwidthNeeded)?.value ?? 0;
      droneBandwidthUsed += perDrone * (item.quantity ?? 1);
    }
  });

  // `fittingToDogmaFit` puts the modules first, so module i is items[i].
  const modules = fitting.modules.map((_, index) => extractModuleResult(calculation.items[index]));

  // Overheated values come from the engine itself (its overload state), not
  // a multiplier applied here: the same fit again with every active module
  // that can overheat set to overload. Skipped when there is none, so a fit
  // with nothing to overheat costs one calculation and shows no overheated line.
  // Callers that never show heat (the variations diff) opt out of the cost.
  const heatable = dogmaFit.items.map(
    (_, index) =>
      index < fitting.modules.length &&
      calculation.items[index]?.max_state === 'overload' &&
      calculation.items[index]?.state === 'active'
  );
  const overheatedCalculation =
    withOverheated && heatable.includes(true)
      ? calculate({
          ...dogmaFit,
          items: dogmaFit.items.map((item, index) =>
            heatable[index] ? { ...item, state: 'overload' } : item
          ),
        })
      : null;

  // Drones follow the modules in `dogmaFit.items`.
  const offenseItems: OffenseItem[] = [
    ...fitting.modules.map((module) => ({
      typeId: module.typeId,
      chargeTypeId: module.chargeTypeId,
      quantity: 1,
      isDrone: false,
    })),
    ...fitting.drones.map((drone) => ({
      typeId: drone.typeId,
      quantity: drone.quantity,
      isDrone: true,
    })),
  ];
  const offense = extractOffense(
    offenseItems,
    calculation.items,
    overheatedCalculation?.items ?? null
  );
  const overheated = overheatedCalculation
    ? extractOverheatedStats(overheatedCalculation.ship.attributes)
    : null;

  return {
    ...baseStats,
    calibrationUsed,
    droneBandwidthUsed,
    modules,
    offense,
    overheated,
  };
}

export interface CandidateCheck {
  /** Nothing about the hull rules it out — rack, hardpoints, rig size, hull restrictions. */
  fitsHull: boolean;
  /** The pilot has every skill it needs. */
  canFly: boolean;
}

function assertReady(): void {
  if (!engineReady) throw new Error('Dogma engine not loaded; await loadDogmaEngine() first');
}

function rulesNaming(violations: readonly Violation[] | undefined, target: 'item' | 'charge') {
  return (violations ?? []).filter(
    (violation) => violation.target.type === target && violation.target.index === 0
  );
}

const candidateCache = new WeakMap<PilotProfile, Map<string, CandidateCheck>>();

/**
 * The Add panel's "fits this hull" and "can fly" chips (issue #1533): each
 * candidate is calculated alone on the bare hull with the engine's own
 * fitting rules on (`validate`). The rules that name the candidate count,
 * and so do the ship-level ones other than skills: with the candidate the
 * only item, a hardpoint shortfall (`slots`, which the engine reports
 * against the ship) can only be its doing, while a hull the pilot can't fly
 * says nothing about a module. Alone, not
 * on the open Fitting, so the answer depends only on hull + rack + pilot and
 * is memoized on exactly that; a clash with something already fitted (a
 * second one-per-ship module, hardpoints all used) shows on the Fitting
 * itself once added. Cheap (~0.3 ms a candidate), but only ever asked about
 * the results that survived the static filters in `candidates.ts`.
 */
export function checkCandidates(
  shipTypeId: number,
  rack: CandidateRack,
  typeIds: readonly number[],
  profile: PilotProfile
): Map<number, CandidateCheck> {
  assertReady();
  let cache = candidateCache.get(profile);
  if (!cache) {
    cache = new Map();
    candidateCache.set(profile, cache);
  }
  const results = new Map<number, CandidateCheck>();
  for (const typeId of typeIds) {
    const key = `${shipTypeId}:${rack}:${typeId}`;
    let check = cache.get(key);
    if (!check) {
      const item: FitItem =
        rack === 'drone'
          ? { type_id: typeId, slot: { type: 'drone_bay' }, quantity: 1, state: 'online' }
          : { type_id: typeId, slot: { type: rack, index: 0 }, state: 'online' };
      const fit: Fit = {
        ship: { type_id: shipTypeId },
        items: [item],
        character: { skills: profile.skillLevels },
      };
      const { violations } = calculate(fit, { validate: true });
      const shipRules = (violations ?? []).filter(
        (v) => v.target.type === 'ship' && v.rule.type !== 'skill'
      );
      check = classifyRuleBreaks(
        [...rulesNaming(violations, 'item'), ...shipRules].map((v) => v.rule.type)
      );
      cache.set(key, check);
    }
    results.set(typeId, check);
  }
  return results;
}

/**
 * Which of `chargeTypeIds` the module takes: loaded into it alone on the
 * hull, a charge of the wrong group or size, or too big for the module's
 * capacity, breaks a rule. A missing skill doesn't — the charge still loads.
 */
export function checkCharges(
  shipTypeId: number,
  module: { slot: FittingSlotKind; typeId: number },
  chargeTypeIds: readonly number[],
  profile: PilotProfile
): Set<number> {
  assertReady();
  const fits = new Set<number>();
  for (const chargeTypeId of chargeTypeIds) {
    const fit: Fit = {
      ship: { type_id: shipTypeId },
      items: [
        {
          type_id: module.typeId,
          slot: { type: module.slot, index: 0 },
          state: 'online',
          charge: { type_id: chargeTypeId },
        },
      ],
      character: { skills: profile.skillLevels },
    };
    const { violations } = calculate(fit, { validate: true });
    const chargeRules = rulesNaming(violations, 'charge').filter((v) => v.rule.type !== 'skill');
    const tooBig = rulesNaming(violations, 'item').some(
      (v) => v.rule.type === 'resource' && v.rule.resource === 'charge_capacity'
    );
    if (chargeRules.length === 0 && !tooBig) fits.add(chargeTypeId);
  }
  return fits;
}
