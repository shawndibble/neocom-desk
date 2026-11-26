import type { PiData } from '@/sde/types';

const SECONDS_PER_HOUR = 3_600;
import { factoryBalance, type FactoryBalance } from '@/engine/pi/factoryBalance';
import { pinsLoad } from '@/engine/pi/pinBudget';
import type { PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import { productBySchematicId } from './productMap';

export function colonyFactoryBalance(colony: BuiltColonyAdvice, pi: PiData): FactoryBalance[] {
  const productBySchematic = productBySchematicId(pi);

  const running: { typeId: number; pins: number }[] = [];
  for (const group of colony.production) {
    if (group.schematicId === undefined) continue;
    const typeId = productBySchematic.get(group.schematicId);
    if (typeId === undefined) continue;
    running.push({ typeId, pins: group.count });
  }

  return factoryBalance(
    {
      running,
      extractedPerHour: new Map(
        colony.extractedPerHour.map((line) => [line.typeId, line.unitsPerHour])
      ),
    },
    pi
  );
}

export function surplusLoad(balance: readonly FactoryBalance[], pi: PiData): PinLoad {
  const counts: Record<string, number> = {};
  for (const line of balance) {
    if (line.status !== 'measured' || line.surplusPins <= 0) continue;
    counts[line.facility] = (counts[line.facility] ?? 0) + line.surplusPins;
  }
  return pinsLoad(counts, pi.infrastructure, { extractorHeads: 0 });
}

function effectivePins(line: FactoryBalance): number {
  return line.status === 'measured' ? Math.min(line.pins, line.feedablePins) : line.pins;
}

export function colonyOutputPerHour(
  balance: readonly FactoryBalance[],
  pi: PiData
): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of balance) {
    const schematic = pi.schematics[String(line.typeId)];
    if (!schematic || schematic.cycleTime <= 0) continue;
    const perPin = (schematic.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
    const pins = effectivePins(line);
    if (pins <= 0) continue;
    out.set(line.typeId, (out.get(line.typeId) ?? 0) + perPin * pins);
  }
  return out;
}

const NET_EPSILON = 1e-9;

export function colonyLocalDrawPerHour(
  balance: readonly FactoryBalance[],
  pi: PiData
): Map<number, number> {
  const draw = new Map<number, number>();
  for (const line of balance) {
    const schematic = pi.schematics[String(line.typeId)];
    if (!schematic || schematic.cycleTime <= 0) continue;
    const pins = effectivePins(line);
    if (pins <= 0) continue;
    for (const input of schematic.inputs) {
      const perPin = (input.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
      draw.set(input.typeID, (draw.get(input.typeID) ?? 0) + perPin * pins);
    }
  }
  return draw;
}

export function colonyExportablePerHour(
  balance: readonly FactoryBalance[],
  pi: PiData
): Map<number, number> {
  return netAgainstDraw(colonyOutputPerHour(balance, pi), colonyLocalDrawPerHour(balance, pi));
}

export function netAgainstDraw(
  produced: ReadonlyMap<number, number>,
  draw: ReadonlyMap<number, number>
): Map<number, number> {
  const net = new Map<number, number>();
  for (const [typeId, unitsPerHour] of produced) {
    const left = unitsPerHour - (draw.get(typeId) ?? 0);
    if (left > unitsPerHour * NET_EPSILON) net.set(typeId, left);
  }
  return net;
}
