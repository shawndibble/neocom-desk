/**
 * A built colony's factory balance, in the terms the Advisor card renders.
 *
 * `engine/pi/factoryBalance.ts` is pure and keyed by *product* typeID.
 * `BuiltColonyAdvice` reports what ESI reports: factory pins grouped by
 * *schematic* id, and extraction as a list rather than a map. This is the
 * translation, and the one place it happens — the same role
 * `stopTierModel.ts` plays for the stop-tier engine.
 */

import type { PiData } from '@/sde/types';

const SECONDS_PER_HOUR = 3_600;
import { factoryBalance, type FactoryBalance } from '@/engine/pi/factoryBalance';
import { pinsLoad } from '@/engine/pi/pinBudget';
import type { PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './advisorModel';
import { productBySchematicId } from './products';

/**
 * This colony's factories measured against what it can put into them.
 *
 * A factory pin whose schematic could not be resolved is dropped rather than
 * grouped under an unknown: `groupFactoryPins` keys those under `undefined`,
 * and folding them into a real schematic's count would inflate that
 * schematic's demand and manufacture a surplus out of a lookup failure.
 */
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

/**
 * What the pins nothing feeds are holding.
 *
 * The whole reason the count is worth printing: on a colony whose Powergrid is
 * the stated reason nothing else fits, four unfed Basic Industry Facilities
 * are 3,200 MW that a pilot can have back for the price of deleting them.
 *
 * Links are not counted, though a deleted pin frees its link too. That is the
 * conservative direction — the figure understates what comes back — and the
 * link a given pin owns is a placement question this app does not answer.
 */
export function surplusLoad(balance: readonly FactoryBalance[], pi: PiData): PinLoad {
  const counts: Record<string, number> = {};
  for (const line of balance) {
    if (line.status !== 'measured' || line.surplusPins <= 0) continue;
    counts[line.facility] = (counts[line.facility] ?? 0) + line.surplusPins;
  }
  return pinsLoad(counts, pi.infrastructure, { extractorHeads: 0 });
}

/**
 * What this colony actually puts out an hour, by product typeID.
 *
 * The *fed* rate, not the built one: eight Basic factories on an extractor
 * that feeds three and a half make what three and a half make, and a network
 * plan sized off the built count would route material that does not exist.
 * `feedablePins` is fractional on purpose here — a colony making 141.34
 * Bacteria an hour is a supply figure, not a pin count.
 *
 * A line whose inputs arrive from off the planet is taken at its built pin
 * count. Its supply is not measurable here by construction, and the pilot who
 * set up those routes is feeding it; assuming otherwise would erase a working
 * P2 colony from the network it is already part of.
 */
export function colonyOutputPerHour(
  balance: readonly FactoryBalance[],
  pi: PiData
): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of balance) {
    const schematic = pi.schematics[String(line.typeId)];
    if (!schematic || schematic.cycleTime <= 0) continue;
    const perPin = (schematic.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
    const pins = line.status === 'measured' ? Math.min(line.pins, line.feedablePins) : line.pins;
    if (pins <= 0) continue;
    out.set(line.typeId, (out.get(line.typeId) ?? 0) + perPin * pins);
  }
  return out;
}
