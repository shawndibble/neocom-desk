import type { PiData, PiPinKind } from '@/sde/types';

const SECONDS_PER_HOUR = 3_600;

const EPSILON = 1e-9;

export interface RunningSchematic {
  typeId: number;
  pins: number;
}

export interface FactoryBalanceInput {
  running: readonly RunningSchematic[];
  extractedPerHour: ReadonlyMap<number, number>;
}

export interface BalanceLineBase {
  typeId: number;
  name: string;
  pins: number;
  facility: PiPinKind;
}

export interface MeasuredBalance extends BalanceLineBase {
  status: 'measured';
  demandPerHour: { typeId: number; name: string; unitsPerHour: number }[];
  supplyPerHour: { typeId: number; name: string; unitsPerHour: number }[];
  feedablePins: number;
  fedPins: number;
  surplusPins: number;
}

export interface UnmeasurableBalance extends BalanceLineBase {
  status: 'inputs-not-local';
  missing: { typeId: number; name: string }[];
}

export type FactoryBalance = MeasuredBalance | UnmeasurableBalance;

function outputPerHour(typeId: number, pi: PiData): number | null {
  const schematic = pi.schematics[String(typeId)];
  if (!schematic || schematic.cycleTime <= 0) return null;
  return (schematic.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
}

export function factoryBalance(input: FactoryBalanceInput, pi: PiData): FactoryBalance[] {
  const known = input.running.filter(
    (line) => pi.schematics[String(line.typeId)] !== undefined && line.pins > 0
  );

  const supply = new Map<number, number>(input.extractedPerHour);
  for (const line of known) {
    const rate = outputPerHour(line.typeId, pi);
    if (rate === null) continue;
    supply.set(line.typeId, (supply.get(line.typeId) ?? 0) + rate * line.pins);
  }

  const demandByInput = new Map<number, number>();
  for (const line of known) {
    const schematic = pi.schematics[String(line.typeId)];
    for (const inputLine of schematic.inputs) {
      const perHour = (inputLine.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
      demandByInput.set(
        inputLine.typeID,
        (demandByInput.get(inputLine.typeID) ?? 0) + perHour * line.pins
      );
    }
  }

  return known.map((line): FactoryBalance => {
    const schematic = pi.schematics[String(line.typeId)];
    const base = {
      typeId: line.typeId,
      name: schematic.name,
      pins: line.pins,
      facility: schematic.facility,
    };

    const missing = schematic.inputs
      .filter((inputLine) => !supply.has(inputLine.typeID))
      .map((inputLine) => ({ typeId: inputLine.typeID, name: inputLine.name }));
    if (missing.length > 0) return { ...base, status: 'inputs-not-local', missing };

    const demandPerHour: MeasuredBalance['demandPerHour'] = [];
    const supplyPerHour: MeasuredBalance['supplyPerHour'] = [];
    let feedablePins = Infinity;

    for (const inputLine of schematic.inputs) {
      const perPin = (inputLine.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
      const mine = perPin * line.pins;
      demandPerHour.push({
        typeId: inputLine.typeID,
        name: inputLine.name,
        unitsPerHour: mine,
      });

      const total = demandByInput.get(inputLine.typeID) ?? mine;
      const available = supply.get(inputLine.typeID) ?? 0;
      const share = total > 0 ? available * (mine / total) : available;
      supplyPerHour.push({ typeId: inputLine.typeID, name: inputLine.name, unitsPerHour: share });
      if (perPin > 0) feedablePins = Math.min(feedablePins, share / perPin);
    }

    if (!Number.isFinite(feedablePins)) feedablePins = line.pins;

    const fedPins = Math.min(line.pins, Math.ceil(feedablePins - EPSILON));
    return {
      ...base,
      status: 'measured',
      demandPerHour,
      supplyPerHour,
      feedablePins,
      fedPins,
      surplusPins: Math.max(0, line.pins - fedPins),
    };
  });
}
