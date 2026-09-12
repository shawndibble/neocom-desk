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
/**
 * Same role as `factoryBalance.ts`'s own `EPSILON`: absorbs float drift so a
 * colony whose production exactly saturates its own factories nets to true
 * zero rather than a signed trace. Relative to the produced rate rather than a
 * fixed floor — these rates run from single units to five figures an hour.
 */
const NET_EPSILON = 1e-9;

/**
 * What this colony's own factories draw an hour, by input typeID.
 *
 * The counterpart to `colonyOutputPerHour`, and the reason it exists: that
 * function reports what each line *makes*, and nothing reported what a line
 * takes off the same planet to make it. A colony extracting Microorganisms
 * into four Bacteria pins, feeding eight Advanced pins on Nanites, was
 * credited with the Bacteria as if it were spare — while the Nanite pins
 * above it wanted seven times that much.
 *
 * ## An imported input does not make the local one free
 *
 * `factoryBalance` marks a whole line `inputs-not-local` as soon as *one* of
 * its inputs is neither extracted nor made here — Nanites want Reactive
 * Metals, which a temperate planet has none of. Everything downstream then
 * stopped reasoning about that line's other input, the one this colony does
 * make. So the line was credited for its output at all eight built pins and
 * charged for its Bacteria at zero, and the difference was offered to the
 * network planner as supply to spend.
 *
 * The fix is the symmetry `colonyOutputPerHour` already assumes: a line whose
 * inputs arrive from off the planet is taken at its built pin count, because
 * the pilot who set up those routes is feeding it. If that is the reason to
 * credit its output at eight pins, it is the same reason to charge its inputs
 * at eight pins. A measured line is charged at the pins its inputs can
 * actually feed, which is what it is credited at.
 *
 * Inputs this colony does not produce are counted too, harmlessly: every
 * caller subtracts this from a map of local output, where an imported type has
 * no entry to take from.
 */
export function colonyLocalDrawPerHour(
  balance: readonly FactoryBalance[],
  pi: PiData
): Map<number, number> {
  const draw = new Map<number, number>();
  for (const line of balance) {
    const schematic = pi.schematics[String(line.typeId)];
    if (!schematic || schematic.cycleTime <= 0) continue;
    const pins = line.status === 'measured' ? Math.min(line.pins, line.feedablePins) : line.pins;
    if (pins <= 0) continue;
    for (const input of schematic.inputs) {
      const perPin = (input.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
      draw.set(input.typeID, (draw.get(input.typeID) ?? 0) + perPin * pins);
    }
  }
  return draw;
}

/**
 * What this colony can actually send somewhere else an hour: what it makes,
 * less what it eats of what it makes.
 *
 * This is the map a network plan may spend. `colonyOutputPerHour` is not —
 * it answers "what does this colony produce", which is a different question
 * from "what is going spare", and treating the first as the second is how a
 * planner came to propose a factory on material that was already committed.
 *
 * A product whose local draw meets or exceeds its production is absent rather
 * than zero, so a caller iterating this map never has to special-case it.
 */
export function colonyExportablePerHour(
  balance: readonly FactoryBalance[],
  pi: PiData
): Map<number, number> {
  const draw = colonyLocalDrawPerHour(balance, pi);
  const exportable = new Map<number, number>();
  for (const [typeId, unitsPerHour] of colonyOutputPerHour(balance, pi)) {
    const net = unitsPerHour - (draw.get(typeId) ?? 0);
    if (net > unitsPerHour * NET_EPSILON) exportable.set(typeId, net);
  }
  return exportable;
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
    const pins = line.status === 'measured' ? Math.min(line.pins, line.feedablePins) : line.pins;
    if (pins <= 0) continue;
    out.set(line.typeId, (out.get(line.typeId) ?? 0) + perPin * pins);
  }
  return out;
}
