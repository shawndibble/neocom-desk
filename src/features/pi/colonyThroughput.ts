import type { PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { extractorProgramsFromPins } from '@/engine/pi/colonyPins';
import { checkThroughput } from '@/engine/pi/pinBudget';
import { extractorCycleYields, hasYieldBaseline, programCycleCount } from '@/engine/pi/extraction';
import type { ExtractorYieldProgram, PiChain, ThroughputCheck } from '@/engine/pi/types';
import { piTier } from '@/engine/pi/chain';
import { colonyFactoryBalance, colonyOutputPerHour } from './factoryBalanceModel';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import { DAY_MS, HOUR_MS } from '@/lib/age';

export function peakRatePerHour(program: ExtractorYieldProgram): number {
  const totalCycles = programCycleCount(program);
  if (totalCycles === 0) return 0;
  const cyclesInADay = Math.max(1, Math.floor(DAY_MS / program.cycleTimeMs));
  const cycles = Math.min(cyclesInADay, totalCycles);
  const yields = extractorCycleYields(program, cycles);
  const totalYield = yields.reduce((sum, value) => sum + value, 0);
  const hours = (cycles * program.cycleTimeMs) / HOUR_MS;
  return hours > 0 ? totalYield / hours : 0;
}

function peakExtractedPerHour(
  pins: readonly PlanetPin[]
): { typeId: number; unitsPerHour: number }[] {
  const productByPin = new Map<number, number | null>();
  for (const pin of pins) {
    if (!pin.extractor_details) continue;
    productByPin.set(pin.pin_id, pin.extractor_details.product_type_id ?? null);
  }

  const order: number[] = [];
  const perProduct = new Map<number, number>();
  for (const program of extractorProgramsFromPins(pins)) {
    if (!hasYieldBaseline(program)) continue;
    const productTypeId = productByPin.get(program.pinId) ?? null;
    if (productTypeId === null) continue;
    const rate = peakRatePerHour(program);
    if (!(rate > 0)) continue;
    if (!perProduct.has(productTypeId)) order.push(productTypeId);
    perProduct.set(productTypeId, (perProduct.get(productTypeId) ?? 0) + rate);
  }
  return order.map((typeId) => ({ typeId, unitsPerHour: perProduct.get(typeId) as number }));
}

function builtColonyChain(
  extractedPerHour: readonly { typeId: number; unitsPerHour: number }[],
  producedPerHour: ReadonlyMap<number, number>,
  pi: PiData
): PiChain {
  const nodes: PiChain['nodes'][number][] = [];
  for (const { typeId, unitsPerHour } of extractedPerHour) {
    nodes.push({
      typeId,
      name: pi.raw.find((resource) => resource.typeID === typeId)?.name ?? String(typeId),
      tier: 0,
      unitsPerHour,
      cycleTimeSeconds: null,
      outputPerCycle: null,
      cyclesPerHour: null,
      outputPerHour: null,
      factoryPins: null,
      inputs: [],
    });
  }
  for (const [typeId, unitsPerHour] of producedPerHour) {
    nodes.push({
      typeId,
      name: pi.schematics[String(typeId)]?.name ?? String(typeId),
      tier: piTier(typeId, pi),
      unitsPerHour,
      cycleTimeSeconds: null,
      outputPerCycle: null,
      cyclesPerHour: null,
      outputPerHour: null,
      factoryPins: null,
      inputs: [],
    });
  }
  return { targetTypeId: 0, targetPerHour: 0, nodes };
}

export interface ColonyThroughputInput {
  colony: BuiltColonyAdvice;
  pins: readonly PlanetPin[];
  pi: PiData;
  linkCapacityPerHour: number | null;
  bufferHours: number;
}

export interface ColonyThroughputResult {
  mean: ThroughputCheck;
  peak: ThroughputCheck;
}

export function colonyThroughputCheck(input: ColonyThroughputInput): ColonyThroughputResult {
  const { colony, pins, pi, linkCapacityPerHour, bufferHours } = input;

  const balance = colonyFactoryBalance(colony, pi);
  const producedPerHour = colonyOutputPerHour(balance, pi);

  const shared = {
    blocks: 1,
    pins: colony.pinLoad.counts,
    infrastructure: pi.infrastructure,
    sourcingFloor: 'P0' as const,
    linkCapacityPerHour,
    bufferHours,
  };

  const meanChain = builtColonyChain(colony.extractedPerHour, producedPerHour, pi);
  const peakChain = builtColonyChain(peakExtractedPerHour(pins), producedPerHour, pi);

  return {
    mean: checkThroughput(meanChain, pi, shared),
    peak: checkThroughput(peakChain, pi, shared),
  };
}

export function colonyHoursToFull(
  colony: BuiltColonyAdvice,
  pins: readonly PlanetPin[],
  pi: PiData,
  haulHours: number
): number | null {
  return colonyStorage(colony, pins, pi, haulHours)?.hoursToFull ?? null;
}

export function colonyStorage(
  colony: BuiltColonyAdvice,
  pins: readonly PlanetPin[],
  pi: PiData,
  haulHours: number
): { hoursToFull: number | null; bufferM3: number } | null {
  if (colony.extractedPerHour.length === 0) return null;
  const check = colonyThroughputCheck({
    colony,
    pins,
    pi,
    linkCapacityPerHour: null,
    bufferHours: haulHours,
  });
  return { hoursToFull: check.peak.hoursToFull, bufferM3: check.peak.bufferM3 };
}
