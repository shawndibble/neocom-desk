import {
  CHARACTER_BASE_LOCKED_TARGETS,
  CHARACTER_DOGMA_ATTRIBUTE,
  CHARGE_GROUP_ATTRIBUTES,
  DOGMA_ATTRIBUTE,
  ITEM_DOGMA_ATTRIBUTE,
  type CapacitorStatus,
  type DamageFigures,
  type FittingItemState,
  type FittingModuleResult,
  type FittingStats,
  type LayerDefense,
  type LocalRepair,
  type OffenseStats,
  type SpoolFigures,
  type OverheatedStats,
  type WeaponRange,
  type WeaponRow,
  type Resonances,
  type AncillaryRepairer,
  type JumpDriveStats,
  type LockedTargets,
  type SensorStats,
  type SensorType,
  type TankStats,
  type FighterStats,
} from './types';
import {
  capacitorBudget,
  capacitorStatusAtDrain,
  loadAdjustment,
  magazineOf,
  reloadDuty,
  sustainedRepair,
  weaponReloadDuty,
  type CapacitorBudget,
  type CapacitorUser,
  type RepairLayer,
  type Repairer,
} from './tank';
import { isMobileDrone } from './appliedDps';
import { droneSpeed, weaponRange } from './appliedWeapons';
import type { CapBoosterFigures } from './capBoosterChoice';

const REPAIR_LAYERS: readonly RepairLayer[] = ['shield', 'armor', 'hull'];

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface ItemCalculationResult {
  attributes: AttributeMap & { size: number };
  state?: FittingItemState;
}

interface CalculatedItem {
  type_id: number;
  slot: { type: string };
  charge?: unknown;
}

function readAttribute(attributes: AttributeMap, attributeId: number): number {
  return attributes.get(attributeId)?.value ?? 0;
}

function defenseLayers(
  shipAttributes: AttributeMap
): Pick<FittingStats, 'shield' | 'armor' | 'hull'> {
  return {
    shield: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.shieldCapacity,
      DOGMA_ATTRIBUTE.shieldEhp,
      DOGMA_ATTRIBUTE.shieldEmResonance,
      DOGMA_ATTRIBUTE.shieldThermalResonance,
      DOGMA_ATTRIBUTE.shieldKineticResonance,
      DOGMA_ATTRIBUTE.shieldExplosiveResonance
    ),
    armor: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.armorHp,
      DOGMA_ATTRIBUTE.armorEhp,
      DOGMA_ATTRIBUTE.armorEmResonance,
      DOGMA_ATTRIBUTE.armorThermalResonance,
      DOGMA_ATTRIBUTE.armorKineticResonance,
      DOGMA_ATTRIBUTE.armorExplosiveResonance
    ),
    hull: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.hullHp,
      DOGMA_ATTRIBUTE.hullEhp,
      DOGMA_ATTRIBUTE.hullEmResonance,
      DOGMA_ATTRIBUTE.hullThermalResonance,
      DOGMA_ATTRIBUTE.hullKineticResonance,
      DOGMA_ATTRIBUTE.hullExplosiveResonance
    ),
  };
}

export function resistPct(resonance: number): number {
  return (1 - resonance) * 100;
}

function capacitorStatus(shipAttributes: AttributeMap): CapacitorStatus {
  const depletesInSeconds = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorDepletesIn);
  if (depletesInSeconds < 0) {
    return {
      stable: true,
      stablePercentage: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorStablePercentage),
    };
  }
  return { stable: false, depletesInSeconds };
}

function reloadAwareCapacitorStatus(
  items: readonly CalculatedItem[],
  shipAttributes: AttributeMap,
  itemResults: readonly ItemCalculationResult[]
): CapacitorStatus {
  const results = itemResults.map((result) => ({
    attributes: result.attributes,
    state: result.state ?? 'offline',
  }));
  if (Math.abs(loadAdjustment(capacitorUsers(items, results))) < 1e-9) {
    return capacitorStatus(shipAttributes);
  }
  const budget = extractCapacitorBudget(items, results, shipAttributes);
  return capacitorStatusAtDrain(
    readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorCapacity),
    readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorRechargeTime) / 1000,
    budget.peakRecharge - budget.delta
  );
}

function localRepair(shipAttributes: AttributeMap): LocalRepair {
  return {
    shield: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.shieldBoostRate),
    armor: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.armorRepairRate),
    hull: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.hullRepairRate),
  };
}

function resonances(
  attributes: AttributeMap,
  emAttr: number,
  thermalAttr: number,
  kineticAttr: number,
  explosiveAttr: number
): Resonances {
  return {
    emResonance: readAttribute(attributes, emAttr),
    thermalResonance: readAttribute(attributes, thermalAttr),
    kineticResonance: readAttribute(attributes, kineticAttr),
    explosiveResonance: readAttribute(attributes, explosiveAttr),
  };
}

function layerDefense(
  shipAttributes: AttributeMap,
  hpAttr: number,
  ehpAttr: number,
  emAttr: number,
  thermalAttr: number,
  kineticAttr: number,
  explosiveAttr: number
): LayerDefense {
  return {
    hp: readAttribute(shipAttributes, hpAttr),
    ehp: readAttribute(shipAttributes, ehpAttr),
    ...resonances(shipAttributes, emAttr, thermalAttr, kineticAttr, explosiveAttr),
  };
}

const SENSOR_ATTRIBUTE: Record<SensorType, number> = {
  radar: DOGMA_ATTRIBUTE.scanRadarStrength,
  ladar: DOGMA_ATTRIBUTE.scanLadarStrength,
  magnetometric: DOGMA_ATTRIBUTE.scanMagnetometricStrength,
  gravimetric: DOGMA_ATTRIBUTE.scanGravimetricStrength,
};

function sensorStats(shipAttributes: AttributeMap): SensorStats {
  const type =
    (Object.keys(SENSOR_ATTRIBUTE) as SensorType[]).find(
      (kind) => readAttribute(shipAttributes, SENSOR_ATTRIBUTE[kind]) > 0
    ) ?? null;
  return { strength: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.scanStrength), type };
}

function jumpDriveStats(shipAttributes: AttributeMap): JumpDriveStats | null {
  const rangeLightYears = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.jumpDriveRange);
  if (rangeLightYears <= 0) return null;
  return {
    rangeLightYears,
    fuelTypeId: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.jumpDriveConsumptionType),
    fuelPerLightYear: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.jumpDriveConsumptionAmount),
  };
}

export function extractLockedTargets(
  shipAttributes: AttributeMap,
  characterAttributes: AttributeMap
): LockedTargets {
  const ship = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxLockedTargets);
  const pilot =
    characterAttributes.get(CHARACTER_DOGMA_ATTRIBUTE.maxLockedTargets)?.value ??
    CHARACTER_BASE_LOCKED_TARGETS;
  return { ship, pilot, effective: Math.min(ship, pilot) };
}

export function extractDroneLimits(
  items: readonly CalculatedItem[],
  itemResults: readonly { attributes: AttributeMap }[],
  characterAttributes: AttributeMap
): Pick<FittingStats, 'maxActiveDrones' | 'droneBandwidthByType'> {
  const droneBandwidthByType: Record<number, number> = {};
  items.forEach((item, index) => {
    const result = itemResults[index];
    if (item.slot.type !== 'drone_bay' || !result) return;
    droneBandwidthByType[item.type_id] = readAttribute(
      result.attributes,
      ITEM_DOGMA_ATTRIBUTE.droneBandwidthNeeded
    );
  });
  return {
    maxActiveDrones: readAttribute(characterAttributes, CHARACTER_DOGMA_ATTRIBUTE.maxActiveDrones),
    droneBandwidthByType,
  };
}

function isUnknownItem(item: CalculatedItem, result: ItemCalculationResult): boolean {
  return item.slot.type !== 'cargo' && result.attributes.size === 0;
}

export function extractFittingStats(
  items: readonly CalculatedItem[],
  shipAttributes: AttributeMap,
  itemResults: readonly ItemCalculationResult[]
): Omit<
  FittingStats,
  | 'ruleBreaks'
  | 'calibrationUsed'
  | 'droneBandwidthUsed'
  | 'maxActiveDrones'
  | 'droneBandwidthByType'
  | 'modules'
  | 'offense'
  | 'overheated'
  | 'applied'
  | 'capacitorBudget'
  | 'tank'
  | 'support'
  | 'mining'
  | 'explore'
  | 'moduleFigures'
  | 'fleetSupport'
  | 'fighters'
  | 'lockedTargets'
  | 'allOverheated'
  | 'unheated'
> {
  const cpuTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuOutput);
  const powergridTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerOutput);

  return {
    cpuTotal,
    cpuUsed: cpuTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuFree),
    powergridTotal,
    powergridUsed: powergridTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerFree),
    calibrationTotal: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.calibration),
    droneDps: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneDamagePerSecond),
    droneBandwidthTotal: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneBandwidth),
    droneCapacity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneCapacity),
    hardpoints: {
      turrets: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.turretHardpoints),
      launchers: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.launcherHardpoints),
    },
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
    repair: localRepair(shipAttributes),
    capacitor: reloadAwareCapacitorStatus(items, shipAttributes, itemResults),
    capacitorCapacity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorCapacity),
    capacitorRechargeTime: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorRechargeTime),
    ...defenseLayers(shipAttributes),
    targeting: {
      maxTargetRange: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxTargetRange),
      maxLockedTargets: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxLockedTargets),
      scanResolution: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.scanResolution),
      signatureRadius: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.signatureRadius),
    },
    navigation: {
      maxVelocity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxVelocity),
      agility: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.agility),
      mass: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.mass),
      warpSpeed:
        readAttribute(shipAttributes, DOGMA_ATTRIBUTE.baseWarpSpeed) *
        readAttribute(shipAttributes, DOGMA_ATTRIBUTE.warpSpeedMultiplier),
    },
    unknownItemTypeIds: items
      .filter((item, index) => isUnknownItem(item, itemResults[index]))
      .map((item) => item.type_id),
    sensor: sensorStats(shipAttributes),
    holds: {
      cargo: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cargoCapacity),
      fleetHangar: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.fleetHangarCapacity),
      miningHold: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.miningHoldCapacity),
      ammoHold: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.specialAmmoHoldCapacity),
      planetaryHold: readAttribute(
        shipAttributes,
        DOGMA_ATTRIBUTE.specialPlanetaryCommoditiesHoldCapacity
      ),
      commandCenterHold: readAttribute(
        shipAttributes,
        DOGMA_ATTRIBUTE.specialCommandCenterHoldCapacity
      ),
      mineralHold: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.specialMineralHoldCapacity),
      gasHold: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.specialGasHoldCapacity),
      iceHold: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.specialIceHoldCapacity),
      fuelBay: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.specialFuelBayCapacity),
      infrastructureHold: readAttribute(
        shipAttributes,
        DOGMA_ATTRIBUTE.specialColonyResourcesHoldCapacity
      ),
    },
    jumpDrive: jumpDriveStats(shipAttributes),
    slotCounts: {
      high: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.hiSlots),
      medium: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.medSlots),
      low: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.lowSlots),
      rig: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.rigSlots),
      subsystem: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.subsystemSlots),
    },
  };
}

interface ModuleCalculationResult {
  attributes: AttributeMap;
  state: FittingItemState;
  max_state: FittingItemState;
  charge?: { attributes: AttributeMap };
}

function chargeGroupIds(attributes: AttributeMap): number[] {
  return CHARGE_GROUP_ATTRIBUTES.map((id) => readAttribute(attributes, id)).filter(
    (groupId) => groupId > 0
  );
}

export function extractModuleResult(result: ModuleCalculationResult): FittingModuleResult {
  const isAdaptingHardener =
    (result.state === 'active' || result.state === 'overload') &&
    readAttribute(result.attributes, ITEM_DOGMA_ATTRIBUTE.resistanceShiftAmount) > 0;
  return {
    state: result.state,
    maxState: result.max_state,
    chargeGroupIds: chargeGroupIds(result.attributes),
    ...(isAdaptingHardener
      ? {
          adaptedResonances: resonances(
            result.attributes,
            DOGMA_ATTRIBUTE.armorEmResonance,
            DOGMA_ATTRIBUTE.armorThermalResonance,
            DOGMA_ATTRIBUTE.armorKineticResonance,
            DOGMA_ATTRIBUTE.armorExplosiveResonance
          ),
        }
      : {}),
  };
}

export interface OffenseItem {
  typeId: number;
  chargeTypeId?: number;
  quantity: number;
  isDrone: boolean;
  isFighter?: boolean;
  chargeDamages?: boolean;
}

export function isFiring(state: FittingItemState): boolean {
  return state === 'active' || state === 'overload';
}

export function needsChargeToFire(attributes: AttributeMap): boolean {
  return (
    chargeGroupIds(attributes).length > 0 &&
    readAttribute(attributes, ITEM_DOGMA_ATTRIBUTE.rateOfFire) > 0
  );
}

function damageFigures(
  attributes: AttributeMap,
  quantity: number,
  neverReloads: boolean
): DamageFigures {
  const dps = readAttribute(attributes, ITEM_DOGMA_ATTRIBUTE.damagePerSecond) * quantity;
  return {
    dps,
    sustainedDps: dps * weaponReloadDuty(attributes, neverReloads),
    volley: readAttribute(attributes, ITEM_DOGMA_ATTRIBUTE.damageVolley) * quantity,
  };
}

function spoolFigures(attributes: AttributeMap, quantity: number): SpoolFigures | null {
  const read = (id: number) => readAttribute(attributes, id);
  const perCycle = read(ITEM_DOGMA_ATTRIBUTE.spoolBonusPerCycle);
  const cycleSeconds = read(ITEM_DOGMA_ATTRIBUTE.rateOfFire) / 1000;
  const max = read(ITEM_DOGMA_ATTRIBUTE.spoolBonusMax);
  if (perCycle <= 0 || max <= 0 || cycleSeconds <= 0) return null;
  const cycles = Math.ceil(max / perCycle - 1e-6);
  return {
    unspooledDps: (read(ITEM_DOGMA_ATTRIBUTE.damageVolley) * quantity) / cycleSeconds,
    secondsToFull: cycles * cycleSeconds,
  };
}

function offenseRange(item: OffenseItem, result: ModuleCalculationResult): { range?: WeaponRange } {
  if (item.isFighter) return {};
  if (item.isDrone && isMobileDrone(droneSpeed(result.attributes))) return {};
  const range = weaponRange(result.attributes, result.charge?.attributes);
  return range && range.optimal > 0 ? { range } : {};
}

export function weaponRowKey(
  row: Pick<WeaponRow, 'isDrone' | 'isFighter' | 'typeId' | 'chargeTypeId'>
): string {
  const kind = row.isFighter ? 'fighter' : row.isDrone ? 'drone' : 'module';
  return `${kind}:${row.typeId}:${row.chargeTypeId ?? ''}`;
}

export function extractFighterStats(shipAttributes: AttributeMap): FighterStats {
  const read = (id: number) => readAttribute(shipAttributes, id);
  const of = (used: number, total: number) => ({ used: read(used), total: read(total) });
  return {
    dps: read(DOGMA_ATTRIBUTE.fighterDamagePerSecond),
    tubes: of(DOGMA_ATTRIBUTE.fighterTubesUsed, DOGMA_ATTRIBUTE.fighterTubes),
    light: of(DOGMA_ATTRIBUTE.fighterLightSlotsUsed, DOGMA_ATTRIBUTE.fighterLightSlots),
    support: of(DOGMA_ATTRIBUTE.fighterSupportSlotsUsed, DOGMA_ATTRIBUTE.fighterSupportSlots),
    heavy: of(DOGMA_ATTRIBUTE.fighterHeavySlotsUsed, DOGMA_ATTRIBUTE.fighterHeavySlots),
    bay: of(DOGMA_ATTRIBUTE.fighterCapacityUsed, DOGMA_ATTRIBUTE.fighterCapacity),
  };
}

export function extractOffense(
  items: readonly OffenseItem[],
  results: readonly ModuleCalculationResult[],
  overheatedResults: readonly ModuleCalculationResult[] | null
): OffenseStats {
  const rows = new Map<string, WeaponRow>();
  let chargelessWeaponCount = 0;
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !isFiring(result.state)) return;
    const figures = damageFigures(result.attributes, item.quantity, item.isDrone);
    if (figures.dps === 0 && figures.volley === 0) {
      if (
        !item.isDrone &&
        item.chargeTypeId === undefined &&
        item.chargeDamages !== false &&
        needsChargeToFire(result.attributes)
      ) {
        chargelessWeaponCount += 1;
      }
      return;
    }

    const heated =
      !item.isDrone && result.max_state === 'overload' ? overheatedResults?.[index] : undefined;
    const key = weaponRowKey(item);
    let row = rows.get(key);
    if (!row) {
      row = {
        typeId: item.typeId,
        chargeTypeId: item.chargeTypeId,
        isDrone: item.isDrone,
        ...(item.isFighter ? { isFighter: true } : {}),
        count: 0,
        dps: 0,
        sustainedDps: 0,
        volley: 0,
        overheated: heated ? { dps: 0, sustainedDps: 0, volley: 0 } : null,
        ...offenseRange(item, result),
      };
      rows.set(key, row);
    }
    row.count += item.quantity;
    row.dps += figures.dps;
    row.sustainedDps += figures.sustainedDps;
    row.volley += figures.volley;
    const spool = spoolFigures(result.attributes, item.quantity);
    if (spool) {
      row.spool = {
        unspooledDps: (row.spool?.unspooledDps ?? 0) + spool.unspooledDps,
        secondsToFull: Math.max(row.spool?.secondsToFull ?? 0, spool.secondsToFull),
      };
    }
    if (heated && row.overheated) {
      const heatedFigures = damageFigures(heated.attributes, item.quantity, item.isDrone);
      row.overheated.dps += heatedFigures.dps;
      row.overheated.sustainedDps += heatedFigures.sustainedDps;
      row.overheated.volley += heatedFigures.volley;
      const heatedSpool = spoolFigures(heated.attributes, item.quantity);
      if (heatedSpool) {
        row.overheated.unspooledDps = (row.overheated.unspooledDps ?? 0) + heatedSpool.unspooledDps;
      }
    }
  });

  const weapons = [...rows.values()];
  const sum = (value: (row: WeaponRow) => number) =>
    weapons.reduce((total, row) => total + value(row), 0);
  const canOverheat = weapons.some((row) => row.overheated !== null);
  return {
    weapons,
    dps: sum((row) => row.dps),
    sustainedDps: sum((row) => row.sustainedDps),
    volley: sum((row) => row.volley),
    overheated: canOverheat
      ? {
          dps: sum((row) => row.overheated?.dps ?? row.dps),
          sustainedDps: sum((row) => row.overheated?.sustainedDps ?? row.sustainedDps),
          volley: sum((row) => row.overheated?.volley ?? row.volley),
        }
      : null,
    chargelessWeaponCount,
  };
}

interface ModuleItem extends CalculatedItem {
  charge?: { type_id: number };
}

interface RunningResult {
  attributes: AttributeMap;
  state: FittingItemState;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);

function runningModules<I extends CalculatedItem, R extends RunningResult>(
  items: readonly I[],
  results: readonly R[]
): { item: I; result: R }[] {
  return items.flatMap((item, index) => {
    const result = results[index];
    return result && MODULE_SLOTS.has(item.slot.type) && isFiring(result.state)
      ? [{ item, result }]
      : [];
  });
}

function capacitorUsers(
  items: readonly CalculatedItem[],
  results: readonly RunningResult[]
): CapacitorUser[] {
  return runningModules(items, results).map(({ item, result }) => {
    const read = (id: number) => readAttribute(result.attributes, id);
    const injectionPerCharge = read(ITEM_DOGMA_ATTRIBUTE.capacitorInjectionAmount);
    const repairs = REPAIR_LAYERS.some((layer) => read(REPAIR_RATE_ATTRIBUTE[layer]) > 0);
    return {
      capPerSecond: read(ITEM_DOGMA_ATTRIBUTE.capacitorPeakLoad),
      ...(injectionPerCharge > 0 ? { injectionPerCharge, magazine: magazineOf(read) } : {}),
      ...(repairs && item.charge !== undefined ? { ancillary: magazineOf(read) } : {}),
    };
  });
}

export function extractCapacitorBudget(
  items: readonly CalculatedItem[],
  results: readonly RunningResult[],
  shipAttributes: AttributeMap
): CapacitorBudget {
  return capacitorBudget(
    capacitorUsers(items, results),
    readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorPeakRecharge)
  );
}

export function extractCapBoosterFigures(
  items: readonly CalculatedItem[],
  shipAttributes: AttributeMap,
  itemResults: readonly ItemCalculationResult[],
  indices: readonly number[]
): CapBoosterFigures | null {
  const first = itemResults[indices[0] ?? -1];
  if (!first) return null;
  const injection = readAttribute(first.attributes, ITEM_DOGMA_ATTRIBUTE.capacitorInjectionAmount);
  const peakLoad = readAttribute(first.attributes, ITEM_DOGMA_ATTRIBUTE.capacitorPeakLoad);
  if (injection <= 0 || peakLoad >= 0) return null;
  const magazine = magazineOf((id) => readAttribute(first.attributes, id));
  const gjPerSecond = indices.reduce((sum, index) => {
    const result = itemResults[index];
    if (!result || !isFiring(result.state ?? 'offline')) return sum;
    const read = (id: number) => readAttribute(result.attributes, id);
    return sum - read(ITEM_DOGMA_ATTRIBUTE.capacitorPeakLoad) * reloadDuty(magazineOf(read));
  }, 0);
  return {
    injection,
    gjPerSecond,
    boostsPerLoad: magazine.cycles,
    capacitor: reloadAwareCapacitorStatus(items, shipAttributes, itemResults),
  };
}

const REPAIR_RATE_ATTRIBUTE: Record<RepairLayer, number> = {
  shield: ITEM_DOGMA_ATTRIBUTE.shieldBoostRate,
  armor: ITEM_DOGMA_ATTRIBUTE.armorRepairRate,
  hull: ITEM_DOGMA_ATTRIBUTE.hullRepairRate,
};

function ehpPerHp(layer: LayerDefense): number {
  return layer.hp > 0 ? layer.ehp / layer.hp : 1;
}

export function extractTank(
  items: readonly ModuleItem[],
  results: readonly RunningResult[],
  shipAttributes: AttributeMap,
  layers: Pick<FittingStats, 'shield' | 'armor' | 'hull'>
): TankStats {
  const repairers: Repairer[] = [];
  const ancillary: AncillaryRepairer[] = [];
  for (const { item, result } of runningModules(items, results)) {
    const read = (id: number) => readAttribute(result.attributes, id);
    if (read(ITEM_DOGMA_ATTRIBUTE.maxRange) > 0) continue;
    for (const layer of REPAIR_LAYERS) {
      const rate = read(REPAIR_RATE_ATTRIBUTE[layer]);
      if (rate <= 0) continue;
      repairers.push({
        layer,
        rate,
        capPerSecond: read(ITEM_DOGMA_ATTRIBUTE.capacitorPeakLoad),
        ...(item.charge ? { ancillary: magazineOf(read) } : {}),
      });
      const pasteMultiplier = read(ITEM_DOGMA_ATTRIBUTE.chargedArmorDamageMultiplier);
      if (pasteMultiplier > 1) {
        const isLoaded = item.charge !== undefined;
        ancillary.push({
          typeId: item.type_id,
          layer,
          loaded: isLoaded ? rate : rate * pasteMultiplier,
          empty: isLoaded ? rate / pasteMultiplier : rate,
          isLoaded,
        });
      }
    }
  }

  const burst = localRepair(shipAttributes);
  for (const layer of REPAIR_LAYERS) {
    const own = repairers.filter((r) => r.layer === layer).reduce((sum, r) => sum + r.rate, 0);
    const received = burst[layer] - own;
    if (received > 1e-6) repairers.push({ layer, rate: received, capPerSecond: 0 });
  }

  const { sustained, capFraction } = sustainedRepair(repairers, {
    peakRecharge: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorPeakRecharge),
    peakLoad:
      readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorPeakLoad) +
      loadAdjustment(capacitorUsers(items, results)),
  });
  const passiveShield = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.passiveShieldRechargeRate);
  const passiveEffective = readAttribute(
    shipAttributes,
    DOGMA_ATTRIBUTE.passiveShieldEffectiveRechargeRate
  );
  const effective = (rates: LocalRepair) =>
    REPAIR_LAYERS.reduce((sum, layer) => sum + rates[layer] * ehpPerHp(layers[layer]), 0) +
    passiveEffective;
  return {
    burst,
    sustained,
    passiveShield,
    burstEffective: effective(burst),
    sustainedEffective: effective(sustained),
    capFraction,
    ancillary,
  };
}

export function extractOverheatedStats(shipAttributes: AttributeMap): OverheatedStats {
  return {
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
    maxVelocity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxVelocity),
    repair: localRepair(shipAttributes),
    ...defenseLayers(shipAttributes),
  };
}

export function unheatedIfChanged<S extends { unheated: S | null }>(
  stats: S,
  format: (stats: S) => string
): string | null {
  if (stats.unheated === null) return null;
  const unheated = format(stats.unheated);
  return unheated === format(stats) ? null : unheated;
}

export function alignTimeSeconds(massKg: number, agility: number): number {
  return Math.log(4) * inertiaTimeConstantSeconds(massKg, agility);
}

export function inertiaTimeConstantSeconds(massKg: number, agility: number): number {
  return (agility * massKg) / 1_000_000;
}

export function showsDrones(
  stats: Pick<FittingStats, 'droneCapacity' | 'droneBandwidthTotal'> | null,
  fittedDrones: number
): boolean {
  if (fittedDrones > 0) return true;
  return stats !== null && (stats.droneCapacity > 0 || stats.droneBandwidthTotal > 0);
}
