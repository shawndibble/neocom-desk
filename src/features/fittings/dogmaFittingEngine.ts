import wasmInit, {
  beacon,
  calculate,
  load_sde,
  type Fit,
  type FitItem,
  type Violation,
} from '@eveshipfit/dogma-engine';
import { classifyRuleBreaks, type CandidateRack } from '@/engine/fittings/candidates';
import { fittingToDogmaFit } from '@/engine/fittings/fitMapper';
import {
  extractCapacitorBudget,
  extractTank,
  extractDroneLimits,
  extractFittingStats,
  extractLockedTargets,
  extractModuleResult,
  extractOffense,
  extractOverheatedStats,
  type OffenseItem,
} from '@/engine/fittings/stats';
import { extractAppliedDpsInputs } from '@/engine/fittings/appliedWeapons';
import { extractSupport } from '@/engine/fittings/support';
import { affectedAttributes, type AffectedAttribute } from '@/engine/fittings/affectedBy';
import { extractMining, miningYield } from '@/engine/fittings/mining';
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

/**
 * Whether a response is the binary asset rather than an error or the app's
 * own HTML page — which a host's SPA fallback (or a dev server that started
 * before the copy below it landed) answers a missing file with, as a 200.
 */
function isEngineAsset(response: Response): boolean {
  return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
}

async function fetchWithProgress(
  url: string,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void
): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  // An HTML page cached by an earlier load is refetched, not served forever.
  const usable = cached && isEngineAsset(cached) ? cached : undefined;
  const response = usable ?? (await fetch(url));
  if (!isEngineAsset(response)) {
    throw new Error(
      `${url}: not the engine asset (${response.status}, ${response.headers.get('content-type') ?? 'no type'})`
    );
  }
  if (!usable) await cache.put(url, response.clone());

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
 * The fit inside an Abyssal weather: the weather's beacon (see
 * `engine/fittings/abyssalWeather.ts`) as what the fit takes in. No weather
 * leaves it as it is. Here, not in the pure mapper, because only this seam
 * may call the engine — `beacon()` is the engine's own.
 */
export function withWeather(fit: Fit, weatherTypeId?: number): Fit {
  if (weatherTypeId === undefined) return fit;
  const weather = beacon(weatherTypeId);
  // Beside whatever the fit already takes in, not instead of it.
  const incoming = fit.incoming ?? {};
  return {
    ...fit,
    incoming: {
      ...incoming,
      effects: [...(incoming.effects ?? []), ...(weather.effects ?? [])],
      buffs: [...(incoming.buffs ?? []), ...(weather.buffs ?? [])],
    },
  };
}

/** What a Fitting's stats are worked out under, beyond the pilot and the Damage Profile. */
export interface StatsOptions {
  /** Also work out the overheated values (the default); callers that never show heat opt out of the cost. */
  overheated?: boolean;
  /** Every figure overheated — every module that can overheat, overloaded (the "Overheat all" switch). */
  overheatAll?: boolean;
  /** An Abyssal weather's beacon type id. */
  weatherTypeId?: number;
}

/**
 * Works out a Fitting's stats under a pilot's skills and implants, with EHP
 * measured against `damageProfile` (the engine's uniform default without
 * one), inside `weather` when there is one. Loads the engine first if this
 * is the first call anywhere in the session.
 */
export async function computeFittingStats(
  fitting: Fitting,
  profile: PilotProfile,
  onProgress?: (progress: DogmaAssetProgress) => void,
  damageProfile?: DamageProfile,
  { overheated: withOverheated = true, overheatAll = false, weatherTypeId }: StatsOptions = {}
): Promise<FittingStats> {
  await loadDogmaEngine(onProgress);
  // The overheated recalculation below spreads this fit, so it keeps the weather too.
  const dogmaFit = withWeather(fittingToDogmaFit(fitting, profile, damageProfile), weatherTypeId);
  const calculation = calculate(dogmaFit);

  // Overheated values come from the engine itself (its overload state), not
  // a multiplier applied here: the same fit again with every active module
  // that can overheat set to overload. Skipped when there is none, so a fit
  // with nothing to overheat costs one calculation and shows no overheated line.
  const heatable = dogmaFit.items.map(
    (_, index) =>
      index < fitting.modules.length &&
      calculation.items[index]?.max_state === 'overload' &&
      calculation.items[index]?.state === 'active'
  );
  const heatedCalculation =
    (withOverheated || overheatAll) && heatable.includes(true)
      ? calculate({
          ...dogmaFit,
          items: dogmaFit.items.map((item, index) =>
            heatable[index] ? { ...item, state: 'overload' } : item
          ),
        })
      : null;

  // "Overheat all": every figure is the heated one, with no second number
  // beside it. The editor's state controls still read the unheated result —
  // they show what the pilot set, not the what-if.
  const allOverheated = overheatAll && heatedCalculation !== null;
  const shown = allOverheated ? heatedCalculation : calculation;
  const beside = allOverheated || !withOverheated ? null : heatedCalculation;

  const baseStats = extractFittingStats(dogmaFit.items, shown.ship.attributes, shown.items);

  // Calibration and drone bandwidth have no single ship-level "used" id the
  // way cpuFree/powerFree do (see types.ts's DOGMA_ATTRIBUTE doc comment) —
  // summed here instead, since only this seam has both `dogmaFit.items`'
  // slot types and `calculation.items`' per-item attribute values. A drone
  // stack only draws bandwidth while deployed ('active'); one sitting in the
  // bay ('online') draws none.
  let calibrationUsed = 0;
  let droneBandwidthUsed = 0;
  dogmaFit.items.forEach((item, index) => {
    const itemAttributes = shown.items[index]?.attributes;
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
  const offense = extractOffense(offenseItems, shown.items, beside?.items ?? null);
  const overheated = beside ? extractOverheatedStats(beside.ship.attributes) : null;

  const applied = extractAppliedDpsInputs(dogmaFit.items, shown.items, shown.character.attributes);
  const lockedTargets = extractLockedTargets(shown.ship.attributes, shown.character.attributes);

  return {
    ...baseStats,
    targeting: { ...baseStats.targeting, maxLockedTargets: lockedTargets.effective },
    ...extractDroneLimits(dogmaFit.items, shown.items, shown.character.attributes),
    calibrationUsed,
    droneBandwidthUsed,
    modules,
    offense,
    overheated,
    applied,
    capacitorBudget: extractCapacitorBudget(dogmaFit.items, shown.items, shown.ship.attributes),
    tank: extractTank(dogmaFit.items, shown.items, shown.ship.attributes, baseStats),
    support: extractSupport(dogmaFit.items, shown.items),
    mining: miningYield(extractMining(dogmaFit.items, shown.items)),
    lockedTargets,
    allOverheated,
  };
}

/**
 * "Affected by" for one fitted module (`engine/fittings/affectedBy.ts`):
 * the same calculation the stats run, with the engine asked for its sources.
 * Only ever on demand — the dialog asking — never on the stats themselves,
 * where the extra bookkeeping would be paid on every edit for nothing.
 */
export async function explainModule(
  fitting: Fitting,
  profile: PilotProfile,
  moduleIndex: number,
  damageProfile?: DamageProfile,
  { overheatAll = false, weatherTypeId }: StatsOptions = {}
): Promise<AffectedAttribute[]> {
  await loadDogmaEngine();
  let dogmaFit = withWeather(fittingToDogmaFit(fitting, profile, damageProfile), weatherTypeId);
  if (overheatAll) {
    // As the stats do: every running module that can overheat, overloaded.
    const plain = calculate(dogmaFit);
    dogmaFit = {
      ...dogmaFit,
      items: dogmaFit.items.map((item, index) =>
        index < fitting.modules.length &&
        plain.items[index]?.max_state === 'overload' &&
        plain.items[index]?.state === 'active'
          ? { ...item, state: 'overload' }
          : item
      ),
    };
  }
  const calculation = calculate(dogmaFit, { sources: true });
  const result = calculation.items[moduleIndex];
  if (!result) return [];
  return affectedAttributes(result.attributes, {
    shipTypeId: dogmaFit.ship.type_id,
    ...(dogmaFit.ship.mode === undefined ? {} : { modeTypeId: dogmaFit.ship.mode }),
    itemTypeIds: dogmaFit.items.map((item) => item.type_id),
    chargeTypeIds: dogmaFit.items.map((item) => item.charge?.type_id),
    projectedTypeIds: (dogmaFit.incoming?.effects ?? []).map((effect) => effect.type_id),
  });
}

export interface CandidateCheck {
  /** Nothing about the hull rules it out — rack, hardpoints, rig size, hull restrictions. */
  fitsHull: boolean;
  /** The pilot has every skill it needs. */
  canFly: boolean;
  /** Fits the bare hull's CPU, powergrid and calibration (with the pilot's skills) — else it never could. */
  fitsResources: boolean;
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
        [...rulesNaming(violations, 'item'), ...shipRules].map((v) =>
          v.rule.type === 'resource' ? `resource:${v.rule.resource}` : v.rule.type
        )
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

/**
 * The charge groups `typeId` itself declares, from calculating it alone on
 * the hull — the same attributes `extractModuleResult` reads off a module
 * already in the Fitting, but for one that isn't fitted yet (issue #1728):
 * `addModule`'s default-charge candidates need this before the module has a
 * calculated result of its own to read `chargeGroupIds` off.
 */
export function chargeGroupIdsFor(
  shipTypeId: number,
  slot: FittingSlotKind,
  typeId: number
): number[] {
  assertReady();
  const fit: Fit = {
    ship: { type_id: shipTypeId },
    items: [{ type_id: typeId, slot: { type: slot, index: 0 }, state: 'online' }],
  };
  const { items } = calculate(fit);
  return items[0] ? extractModuleResult(items[0]).chargeGroupIds : [];
}
