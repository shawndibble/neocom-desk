import wasmInit, {
  beacon,
  calculate,
  load_sde,
  type Calculation,
  type Fit,
  type FitItem,
  type Projection,
  type Violation,
} from '@eveshipfit/dogma-engine';
import { setDogmaEngineStatus } from './dogmaEngineStatus';
import { SDE_URL, WASM_URL } from './dogmaEngineAssets';
import {
  deleteStaleAssetCaches,
  fetchWithProgress,
  warmDogmaEngineAssets,
  type DogmaAssetProgress,
} from './dogmaEngineLoader';
import { classifyRuleBreaks, type CandidateRack } from '@/engine/fittings/candidates';
import type { PlanEntry } from '@/engine/types';
import { loadTypeEffects, loadTypes } from '@/sde/loadSde';
import { racksWithSlots } from '@/engine/fittings/hullFitKey';
import { fittingToDogmaFit } from '@/engine/fittings/fitMapper';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import type { SlotOf } from '@/engine/fittings/implantFinder';
import { loadImplantMarketEntries } from './implantSlotLookup';
import {
  extractCapBoosterFigures,
  extractModuleResult,
  isFiring,
  needsChargeToFire,
} from '@/engine/fittings/stats';
import {
  APPLIED_DPS_ATTRIBUTE,
  chargeDamageSplit,
  weaponRange,
} from '@/engine/fittings/appliedWeapons';
import { chargesUsedPerMinute, type ChargeChoice } from '@/engine/fittings/chargeChoice';
import {
  affectedAttributes,
  type AffectedAttribute,
  type AffectedByContext,
  type AffectedSource,
} from '@/engine/fittings/affectedBy';
import { skillSourceTypeIds } from '@/engine/fittings/skillGains';
import type { SkilledTarget } from '@/engine/fittings/skilledTarget';
import { skilledSourcesOf, type SkilledSource } from '@/engine/fittings/skilledSources';
import { COVERT_CLOAK_EFFECT } from '@/engine/fittings/explore';
import { extractCrystalFigures } from '@/engine/fittings/mining';
import { assembleStats } from '@/engine/fittings/statsAssembly';
import { projectsNothing } from '@/engine/fittings/projection';
import {
  DOGMA_ATTRIBUTE,
  ITEM_DOGMA_ATTRIBUTE,
  type Fitting,
  type FittingSlotKind,
  type FittingStats,
  type RuleBreak,
  type PilotProfile,
  type DamageProfile,
  type ProjectedEffects,
} from '@/engine/fittings/types';

export { warmDogmaEngineAssets, type DogmaAssetProgress };

let enginePromise: Promise<DogmaEngine> | null = null;
let readyMutaplasmids: MutaplasmidLookup | null = null;
let readySlotOf: SlotOf | null = null;
let readyCovertCloaks: ReadonlySet<number> = new Set();

function toDogmaFit(fitting: Fitting, profile: PilotProfile, damageProfile?: DamageProfile) {
  return fittingToDogmaFit(fitting, profile, damageProfile, readyMutaplasmids, readySlotOf);
}

let readyEngine: DogmaEngine | null = null;
const readyListeners = new Set<() => void>();
const progressListeners = new Set<(progress: DogmaAssetProgress) => void>();
let lastProgress: DogmaAssetProgress | null = null;

export function readyDogmaEngine(): DogmaEngine | null {
  return readyEngine;
}

export function subscribeDogmaEngine(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

export function loadDogmaEngine(
  onProgress?: (progress: DogmaAssetProgress) => void
): Promise<DogmaEngine> {
  if (onProgress && !readyEngine) {
    progressListeners.add(onProgress);
    if (lastProgress) onProgress(lastProgress);
  }
  if (!enginePromise) {
    lastProgress = null;
    void deleteStaleAssetCaches();
    setDogmaEngineStatus('loading');
    enginePromise = (async () => {
      let wasmLoaded = 0;
      let sdeLoaded = 0;
      let wasmTotal: number | null = null;
      let sdeTotal: number | null = null;
      const report = () => {
        const totalBytes = wasmTotal === null || sdeTotal === null ? null : wasmTotal + sdeTotal;
        lastProgress = { loadedBytes: wasmLoaded + sdeLoaded, totalBytes };
        for (const listener of [...progressListeners]) listener(lastProgress);
      };

      const [wasmBytes, sdeBytes, mutaplasmids, slotOf, typeEffects] = await Promise.all([
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
        loadMutaplasmidLookup().catch(() => null),
        loadImplantMarketEntries()
          .then((entries) => entries.slotOf)
          .catch(() => null),
        loadTypeEffects().catch(() => null),
      ]);

      await wasmInit({ module_or_path: wasmBytes });
      load_sde(new Uint8Array(sdeBytes));
      readyMutaplasmids = mutaplasmids;
      readySlotOf = slotOf;
      readyCovertCloaks = new Set(typeEffects?.[COVERT_CLOAK_EFFECT] ?? []);
      readyEngine = dogmaEngine;
      progressListeners.clear();
      setDogmaEngineStatus('ready');
      for (const listener of readyListeners) listener();
      return dogmaEngine;
    })().catch((error: unknown) => {
      enginePromise = null;
      progressListeners.clear();
      setDogmaEngineStatus('failed');
      throw error;
    });
  }
  return enginePromise;
}

export function warmDogmaEngine(): void {
  void loadDogmaEngine().catch(() => {});
}

export function withWeather(fit: Fit, weatherTypeId?: number): Fit {
  if (weatherTypeId === undefined) return fit;
  const weather = beacon(weatherTypeId);
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

export interface StatsOptions {
  overheated?: boolean;
  overheatAll?: boolean;
  weatherTypeId?: number;
  incoming?: ProjectedEffects;
}

export function withIncoming(fit: Fit, projected?: ProjectedEffects): Fit {
  if (!projected || projectsNothing(projected)) return fit;
  const incoming = fit.incoming ?? {};
  return {
    ...fit,
    incoming: {
      ...incoming,
      effects: [
        ...(incoming.effects ?? []),
        ...projected.effects.map((effect) => ({
          type_id: effect.typeId,
          effect_id: effect.effectId,
          attributes: effect.attributes,
          quantity: effect.quantity,
        })),
      ],
      buffs: [...(incoming.buffs ?? []), ...projected.buffs],
    },
  };
}

function attributeRecord(
  values: Map<number, number> | Record<number, number> | undefined
): Record<number, number> {
  if (!values) return {};
  return values instanceof Map ? Object.fromEntries(values) : { ...values };
}

export async function computeOutgoing(
  fitting: Fitting,
  profile: PilotProfile
): Promise<ProjectedEffects> {
  await loadDogmaEngine();
  return toProjectedEffects(calculate(toDogmaFit(fitting, profile)).outgoing);
}

export function toProjectedEffects(outgoing: Projection | undefined): ProjectedEffects {
  return {
    buffs: (outgoing?.buffs ?? []).map((buff) => ({ id: buff.id, value: buff.value })),
    effects: (outgoing?.effects ?? []).map((effect) => ({
      typeId: effect.type_id,
      effectId: effect.effect_id,
      attributes: attributeRecord(effect.attributes),
      quantity: effect.quantity ?? 1,
    })),
  };
}

function overloadHeatable(
  dogmaFit: Fit,
  moduleCount: number,
  calculation: ReturnType<typeof calculate>
): Fit | null {
  const heatable = dogmaFit.items.map(
    (_, index) =>
      index < moduleCount &&
      calculation.items[index]?.max_state === 'overload' &&
      calculation.items[index]?.state === 'active'
  );
  if (!heatable.includes(true)) return null;
  return {
    ...dogmaFit,
    items: dogmaFit.items.map((item, index) =>
      heatable[index] ? { ...item, state: 'overload' } : item
    ),
  };
}

const chargeDamageByGroups = new Map<string, boolean>();

async function chargesDealDamage(
  shipTypeId: number,
  module: { slot: FittingSlotKind; typeId: number },
  groupIds: readonly number[]
): Promise<boolean> {
  const key = [...groupIds].sort((a, b) => a - b).join(',');
  const known = chargeDamageByGroups.get(key);
  if (known !== undefined) return known;
  let types;
  try {
    types = await loadTypes();
  } catch {
    return true;
  }
  const groups = new Set(groupIds);
  let damages = false;
  for (const [id, info] of Object.entries(types)) {
    if (!groups.has(info.groupID)) continue;
    const { items } = calculate({
      ship: { type_id: shipTypeId },
      items: [
        {
          type_id: module.typeId,
          slot: { type: module.slot, index: 0 },
          state: 'online',
          charge: { type_id: Number(id) },
        },
      ],
    });
    const charge = items[0]?.charge?.attributes;
    if (!charge) return true;
    if (chargeDamageSplit(charge) !== null) {
      damages = true;
      break;
    }
  }
  chargeDamageByGroups.set(key, damages);
  return damages;
}

async function modulesWithHarmlessCharges(
  fitting: Fitting,
  calculation: ReturnType<typeof calculate>
): Promise<Set<number>> {
  const harmless = new Set<number>();
  const checked = new Set<number>();
  for (const [index, module] of fitting.modules.entries()) {
    const result = calculation.items[index];
    if (!result || module.chargeTypeId !== undefined || checked.has(module.typeId)) continue;
    if (!isFiring(module.state)) continue;
    if (!needsChargeToFire(result.attributes)) continue;
    checked.add(module.typeId);
    const { chargeGroupIds } = extractModuleResult(result);
    if (!(await chargesDealDamage(fitting.shipTypeId, module, chargeGroupIds)))
      harmless.add(module.typeId);
  }
  return harmless;
}

export function ruleBreaksOf(
  dogmaFit: Fit,
  violations: readonly Violation[] | undefined
): RuleBreak[] {
  const breaks: RuleBreak[] = [];
  for (const { target, rule } of violations ?? []) {
    switch (rule.type) {
      case 'skill':
      case 'resource':
        break;
      case 'max_group':
        breaks.push({
          kind: 'max_group',
          groupId: rule.group_id,
          limit: rule.limit,
          used: rule.used,
          allowed: rule.allowed,
        });
        break;
      case 'max_type':
        breaks.push({
          kind: 'max_type',
          typeId: rule.type_id,
          used: rule.used,
          allowed: rule.allowed,
        });
        break;
      case 'slots':
        breaks.push({
          kind: 'slots',
          slot: rule.slot,
          used: rule.used,
          available: rule.available,
        });
        break;
      default:
        breaks.push({
          kind: rule.type,
          typeId: target.type === 'ship' ? null : (dogmaFit.items[target.index]?.type_id ?? null),
        });
    }
  }
  return breaks;
}

export async function computeFittingStats(
  fitting: Fitting,
  profile: PilotProfile,
  onProgress?: (progress: DogmaAssetProgress) => void,
  damageProfile?: DamageProfile,
  {
    overheated: withOverheated = true,
    overheatAll = false,
    weatherTypeId,
    incoming,
  }: StatsOptions = {}
): Promise<FittingStats> {
  await loadDogmaEngine(onProgress);
  const dogmaFit = withIncoming(
    withWeather(toDogmaFit(fitting, profile, damageProfile), weatherTypeId),
    incoming
  );
  const calculation = calculate(dogmaFit, { validate: true });
  const ruleBreaks = ruleBreaksOf(dogmaFit, calculation.violations);
  const harmlessCharges = await modulesWithHarmlessCharges(fitting, calculation);

  const heatedFit =
    withOverheated || overheatAll
      ? overloadHeatable(dogmaFit, fitting.modules.length, calculation)
      : null;
  const heatedCalculation = heatedFit === null ? null : calculate(heatedFit);

  const allOverheated = overheatAll && heatedCalculation !== null;
  const stats = (shown: Calculation, beside: Calculation | null) =>
    assembleStats({
      fitting,
      dogmaFit,
      calculation,
      shown,
      beside,
      harmlessCharges,
      ruleBreaks,
      covertCloaks: readyCovertCloaks,
    });
  if (allOverheated) {
    const unheated = stats(calculation, null);
    return {
      ...stats(heatedCalculation, null),
      allOverheated: true,
      unheated: { ...unheated, allOverheated: false, unheated: null },
    };
  }
  return {
    ...stats(calculation, withOverheated ? heatedCalculation : null),
    allOverheated: false,
    unheated: null,
  };
}

export async function explainModule(
  fitting: Fitting,
  profile: PilotProfile,
  moduleIndex: number,
  damageProfile?: DamageProfile,
  { overheatAll = false, weatherTypeId, incoming }: StatsOptions = {}
): Promise<AffectedAttribute[]> {
  await loadDogmaEngine();
  let dogmaFit = withIncoming(
    withWeather(toDogmaFit(fitting, profile, damageProfile), weatherTypeId),
    incoming
  );
  if (overheatAll) {
    dogmaFit = overloadHeatable(dogmaFit, fitting.modules.length, calculate(dogmaFit)) ?? dogmaFit;
  }
  const calculation = calculate(dogmaFit, { sources: true });
  const result = calculation.items[moduleIndex];
  if (!result) return [];
  return affectedAttributes(result.attributes, affectedContextOf(dogmaFit));
}

function affectedContextOf(dogmaFit: Fit): AffectedByContext {
  return {
    shipTypeId: dogmaFit.ship.type_id,
    ...(dogmaFit.ship.mode === undefined ? {} : { modeTypeId: dogmaFit.ship.mode }),
    itemTypeIds: dogmaFit.items.map((item) => item.type_id),
    chargeTypeIds: dogmaFit.items.map((item) => item.charge?.type_id),
    projectedTypeIds: (dogmaFit.incoming?.effects ?? []).map((effect) => effect.type_id),
  };
}

const CAPSULE_TYPE_ID = 670;

export interface SkilledAttribute {
  value: number;
  sources: SkilledSource[];
}

export async function skilledAttributes(
  target: SkilledTarget,
  profile: PilotProfile
): Promise<Map<number, SkilledAttribute>> {
  await loadDogmaEngine();
  const fitting: Fitting =
    target.kind === 'ship'
      ? { shipTypeId: target.typeId, name: '', modules: [], drones: [], cargo: [] }
      : {
          shipTypeId: CAPSULE_TYPE_ID,
          name: '',
          modules: [
            {
              slot: target.slot,
              slotIndex: 0,
              typeId: target.typeId,
              state: 'online',
              ...(target.mutation ? { mutation: target.mutation } : {}),
            },
          ],
          drones: [],
          cargo: [],
        };
  const dogmaFit = toDogmaFit(fitting, profile);
  const calculation = calculate(dogmaFit, { sources: true });
  const result = target.kind === 'ship' ? calculation.ship : calculation.items[0];
  if (!result) return new Map();
  const sourcesById = new Map(
    affectedAttributes(result.attributes, affectedContextOf(dogmaFit)).map((row) => [
      row.attributeId,
      row.sources,
    ])
  );
  const hullBonusSkills = (attributeId: number): AffectedSource[] =>
    (result.attributes.get(attributeId)?.sources ?? []).flatMap((source) => {
      if (
        source.from.type !== 'ship' ||
        !source.applied ||
        source.source_attribute_id === undefined
      )
        return [];
      return (calculation.ship.attributes.get(source.source_attribute_id)?.sources ?? []).flatMap(
        (bonus): AffectedSource[] =>
          bonus.from.type === 'skill' && bonus.applied
            ? [
                {
                  kind: 'skill',
                  typeId: bonus.from.type_id,
                  operator: bonus.operator,
                  value: bonus.value,
                  penalty: null,
                  applied: true,
                },
              ]
            : []
      );
    });
  const skilled = new Map<number, SkilledAttribute>();
  for (const [id, { base, value }] of result.attributes) {
    if (id <= 0 || value === base) continue;
    const sources = skilledSourcesOf(
      [...(sourcesById.get(id) ?? []), ...hullBonusSkills(id)],
      profile
    );
    if (sources.length === 0) continue;
    skilled.set(id, { value, sources });
  }
  return skilled;
}

export async function fittingSkillSources(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile?: DamageProfile,
  { weatherTypeId, incoming }: StatsOptions = {}
): Promise<number[]> {
  await loadDogmaEngine();
  const dogmaFit = withIncoming(
    withWeather(toDogmaFit(fitting, profile, damageProfile), weatherTypeId),
    incoming
  );
  const calculation = calculate(dogmaFit, { sources: true });
  return [
    ...skillSourceTypeIds([
      calculation.ship,
      calculation.character,
      ...(calculation.mode ? [calculation.mode] : []),
      ...calculation.items,
    ]),
  ];
}

export interface CandidateCheck {
  fitsHull: boolean;
  canFly: boolean;
  fitsResources: boolean;
}

function rulesNaming(violations: readonly Violation[] | undefined, target: 'item' | 'charge') {
  return (violations ?? []).filter(
    (violation) => violation.target.type === target && violation.target.index === 0
  );
}

const candidateCache = new WeakMap<PilotProfile, Map<string, CandidateCheck>>();

function checkCandidates(
  shipTypeId: number,
  rack: CandidateRack,
  typeIds: readonly number[],
  profile: PilotProfile
): Map<number, CandidateCheck> {
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
      check = checkOneCandidate(shipTypeId, rack, typeId, profile.skillLevels);
      cache.set(key, check);
    }
    results.set(typeId, check);
  }
  return results;
}

function validateCandidate(
  shipTypeId: number,
  rack: CandidateRack,
  typeId: number,
  skillLevels: Map<number, number>
): Violation[] {
  const item: FitItem =
    rack === 'drone'
      ? { type_id: typeId, slot: { type: 'drone_bay' }, quantity: 1, state: 'online' }
      : { type_id: typeId, slot: { type: rack, index: 0 }, state: 'online' };
  const fit: Fit = {
    ship: { type_id: shipTypeId },
    items: [item],
    character: { skills: skillLevels },
  };
  return calculate(fit, { validate: true }).violations ?? [];
}

function candidateRuleTypes(violations: readonly Violation[]): string[] {
  const shipRules = violations.filter((v) => v.target.type === 'ship' && v.rule.type !== 'skill');
  return [...rulesNaming(violations, 'item'), ...shipRules].map((v) =>
    v.rule.type === 'resource' ? `resource:${v.rule.resource}` : v.rule.type
  );
}

function checkOneCandidate(
  shipTypeId: number,
  rack: CandidateRack,
  typeId: number,
  skillLevels: Map<number, number>
): CandidateCheck {
  return classifyRuleBreaks(
    candidateRuleTypes(validateCandidate(shipTypeId, rack, typeId, skillLevels))
  );
}

const NO_SKILLS: Map<number, number> = new Map();

function checkHullCandidate(
  shipTypeId: number,
  rack: CandidateRack,
  typeId: number,
  skillLevels: Map<number, number>
): CandidateCheck {
  const bare = validateCandidate(shipTypeId, rack, typeId, NO_SKILLS);
  const base = classifyRuleBreaks(candidateRuleTypes(bare));
  if (!base.fitsHull) return base;
  if (!base.fitsResources) return checkOneCandidate(shipTypeId, rack, typeId, skillLevels);
  const canFly = rulesNaming(bare, 'item').every(
    (v) => v.rule.type !== 'skill' || (skillLevels.get(v.rule.type_id) ?? 0) >= v.rule.required
  );
  return { fitsHull: true, canFly, fitsResources: true };
}

function moduleSkillRequirements(
  shipTypeId: number,
  rack: CandidateRack,
  typeId: number
): PlanEntry[] {
  return rulesNaming(validateCandidate(shipTypeId, rack, typeId, NO_SKILLS), 'item').flatMap(
    (violation) =>
      violation.rule.type === 'skill'
        ? [{ skillTypeID: violation.rule.type_id, targetLevel: violation.rule.required }]
        : []
  );
}

function hullSlotCounts(
  shipTypeId: number,
  skillLevels: Map<number, number>
): Record<FittingSlotKind, number> {
  const { ship } = calculate({
    ship: { type_id: shipTypeId },
    items: [],
    character: { skills: skillLevels },
  });
  const read = (attributeId: number) => ship.attributes.get(attributeId)?.value ?? 0;
  return {
    high: read(DOGMA_ATTRIBUTE.hiSlots),
    medium: read(DOGMA_ATTRIBUTE.medSlots),
    low: read(DOGMA_ATTRIBUTE.lowSlots),
    rig: read(DOGMA_ATTRIBUTE.rigSlots),
    subsystem: read(DOGMA_ATTRIBUTE.subsystemSlots),
  };
}

function hullRacks(shipTypeId: number, skillLevels: Map<number, number>): Set<CandidateRack> {
  return racksWithSlots(hullSlotCounts(shipTypeId, skillLevels));
}

function checkCharges(
  shipTypeId: number,
  module: { slot: FittingSlotKind; typeId: number },
  chargeTypeIds: readonly number[],
  profile: PilotProfile
): Set<number> {
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

function chargeGroupIdsFor(shipTypeId: number, slot: FittingSlotKind, typeId: number): number[] {
  const fit: Fit = {
    ship: { type_id: shipTypeId },
    items: [{ type_id: typeId, slot: { type: slot, index: 0 }, state: 'online' }],
  };
  const { items } = calculate(fit);
  return items[0] ? extractModuleResult(items[0]).chargeGroupIds : [];
}

function moduleChargeCapacity(
  shipTypeId: number,
  module: { slot: FittingSlotKind; typeId: number }
): number {
  const { items } = calculate({
    ship: { type_id: shipTypeId },
    items: [{ type_id: module.typeId, slot: { type: module.slot, index: 0 }, state: 'online' }],
  });
  return items[0]?.attributes.get(DOGMA_ATTRIBUTE.cargoCapacity)?.value ?? 0;
}

function chargesMissingSkills(
  shipTypeId: number,
  module: { slot: FittingSlotKind; typeId: number },
  chargeTypeIds: readonly number[],
  profile: PilotProfile
): Set<number> {
  const missing = new Set<number>();
  for (const chargeTypeId of chargeTypeIds) {
    const { violations } = calculate(
      {
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
      },
      { validate: true }
    );
    if (rulesNaming(violations, 'charge').some((v) => v.rule.type === 'skill')) {
      missing.add(chargeTypeId);
    }
  }
  return missing;
}

export interface ChargeBasis {
  pilot: PilotProfile;
  damageProfile?: DamageProfile;
  options: Pick<StatsOptions, 'weatherTypeId' | 'incoming'>;
}

export interface ChargeEngineStats extends Pick<
  ChargeChoice,
  'typeId' | 'dps' | 'optimal' | 'falloff' | 'damage' | 'roundsPerMinute' | 'cap' | 'mining'
> {
  techLevel: number;
}

function compareCharges(
  fitting: Fitting,
  profile: PilotProfile,
  moduleTypeId: number,
  chargeTypeIds: readonly number[],
  basis?: ChargeBasis
): ChargeEngineStats[] {
  const indices = fitting.modules.flatMap((module, index) =>
    module.typeId === moduleTypeId ? [index] : []
  );
  if (indices.length === 0) return [];
  const first = indices[0]!;
  return chargeTypeIds.map((chargeTypeId) => {
    const trial: Fitting = {
      ...fitting,
      modules: fitting.modules.map((module) =>
        module.typeId === moduleTypeId
          ? {
              ...module,
              chargeTypeId,
              state: module.state === 'overload' ? 'overload' : 'active',
            }
          : module
      ),
    };
    const dogmaFit = basis
      ? withIncoming(
          withWeather(
            toDogmaFit(trial, basis.pilot, basis.damageProfile),
            basis.options.weatherTypeId
          ),
          basis.options.incoming
        )
      : toDogmaFit(trial, profile);
    const { items, ship } = calculate(dogmaFit);
    const cap = extractCapBoosterFigures(dogmaFit.items, ship.attributes, items, indices);
    const mining = extractCrystalFigures(dogmaFit.items, items, indices);
    const item = items[first];
    const charge = item?.charge?.attributes;
    const read = (attrs: typeof charge, id: number) => attrs?.get(id)?.value ?? 0;
    const range = item ? weaponRange(item.attributes, charge) : null;
    const isCrystal =
      read(charge, ITEM_DOGMA_ATTRIBUTE.crystalVolatility) > 0 ||
      charge?.get(ITEM_DOGMA_ATTRIBUTE.crystalsTakeDamage) !== undefined;
    return {
      typeId: chargeTypeId,
      dps: indices.reduce(
        (sum, index) => sum + read(items[index]?.attributes, APPLIED_DPS_ATTRIBUTE.dps),
        0
      ),
      optimal: range?.optimal ?? 0,
      falloff: range?.falloff ?? 0,
      damage: chargeDamageSplit(charge),
      roundsPerMinute: chargesUsedPerMinute({
        rateOfFireMs: read(item?.attributes, ITEM_DOGMA_ATTRIBUTE.rateOfFire),
        guns: indices.length,
        crystal: isCrystal
          ? {
              takesDamage: read(charge, ITEM_DOGMA_ATTRIBUTE.crystalsTakeDamage) === 1,
              volatility: read(charge, ITEM_DOGMA_ATTRIBUTE.crystalVolatility),
              volatilityDamage: read(charge, ITEM_DOGMA_ATTRIBUTE.crystalVolatilityDamage),
              hitpoints: read(charge, ITEM_DOGMA_ATTRIBUTE.structureHitpoints),
            }
          : null,
      }),
      techLevel: read(charge, ITEM_DOGMA_ATTRIBUTE.techLevel),
      ...(cap ? { cap } : {}),
      ...(mining ? { mining } : {}),
    };
  });
}

const dogmaEngine = {
  checkCandidates,
  checkOneCandidate,
  checkHullCandidate,
  moduleSkillRequirements,
  hullSlotCounts,
  hullRacks,
  checkCharges,
  chargeGroupIdsFor,
  moduleChargeCapacity,
  chargesMissingSkills,
  compareCharges,
};

export type DogmaEngine = typeof dogmaEngine;
