/**
 * Whether a colony's factories have anything to eat.
 *
 * ## The measurement the Advisor was missing
 *
 * `pinBudget.ts` answers what a colony's CPU and Powergrid *hold*. It says
 * nothing about whether the pins already standing there are fed, and a pin
 * that is not fed is worse than an empty slot: it draws the full budget and
 * produces nothing. On the reported operation, four colonies were running
 * thirty-one Basic Industry Facilities against enough extraction for
 * twenty-two — nine pins holding 7,200 MW on planets whose Powergrid was the
 * stated reason nothing else would fit.
 *
 * Nothing on the tab could say so, because "how much does this colony extract"
 * and "how much do these factories eat" lived on opposite sides of the card
 * and were never compared.
 *
 * ## Why a count of pins rather than a percentage
 *
 * A duty-cycle figure ("these factories run at 44%") is true and useless: the
 * pilot's move is to delete pins, and the only actionable form of the answer
 * is how many. So the output is `fedPins` and `surplusPins`, and `fedPins`
 * rounds the fractional figure **up**: 3.53 factories' worth of ore keeps four
 * pins busy, because the shortfall is smoothed by the colony's buffer rather
 * than starving a fourth pin outright. Simulating CCP's own decay curve
 * against the reported colony's real storage confirms four pins process 100%
 * of a program where three leave 153,635 units in the ground.
 *
 * ## What is refused rather than guessed
 *
 * An input this colony neither extracts nor makes is **imported**, and a
 * colony routing material in from a sibling planet is exactly what a network
 * is for — so its factories are reported `inputs-not-local`, never surplus.
 * Treating an absent supply as zero would tell a pilot to delete the very
 * factories their imports feed. The same refusal covers an extractor whose
 * program carries no install-time baseline: `advisorModel` reports its rate as
 * `null` and leaves the resource out of the map, and out is not zero.
 *
 * ## Sharing one input between two schematics
 *
 * Two schematics can want the same input — Test Cultures and Water-Cooled CPU
 * both eat Water. The supply is split **in proportion to what each asked
 * for**, which is a stated convention rather than a measurement: ESI's
 * `routes[]` carries the real per-pin split, and reading it would mean
 * modelling pin placement, which the Advisor has never done. The convention is
 * exact in the only case that has come up — one schematic on one input — and
 * is neutral rather than optimistic in the others.
 *
 * Pure: pin counts, rates and the payload are all parameters. No fetch, no
 * clock, no Dexie.
 */

import type { PiData, PiPinKind } from '@/sde/types';

const SECONDS_PER_HOUR = 3_600;

/** Absorbs float drift so 4.0000000001 pins does not report a phantom fifth. */
const EPSILON = 1e-9;

export interface RunningSchematic {
  /** The product typeID, which is how `PiData.schematics` is keyed. */
  typeId: number;
  /** Factory pins running it. */
  pins: number;
}

export interface FactoryBalanceInput {
  running: readonly RunningSchematic[];
  /**
   * Sustained units an hour this colony extracts, by resource typeID, off
   * `engine/pi/extraction.ts`'s decay curve. A resource whose program could
   * not be projected is **absent**, never zero.
   */
  extractedPerHour: ReadonlyMap<number, number>;
}

export interface BalanceLineBase {
  typeId: number;
  name: string;
  pins: number;
  /**
   * The facility that runs this schematic, from the payload's own
   * schematic-to-pin map — so a caller pricing what a surplus pin frees does
   * not have to assume a tier-to-facility table.
   */
  facility: PiPinKind;
}

export interface MeasuredBalance extends BalanceLineBase {
  status: 'measured';
  /** What these pins draw, per input, at full rate. */
  demandPerHour: { typeId: number; name: string; unitsPerHour: number }[];
  /** What this colony supplies towards that draw, after sharing with any other schematic wanting it. */
  supplyPerHour: { typeId: number; name: string; unitsPerHour: number }[];
  /** Pins the scarcest input sustains. Fractional, and the honest figure. */
  feedablePins: number;
  /** Whole pins worth keeping — `feedablePins` rounded up, never above `pins`. */
  fedPins: number;
  /** Pins beyond what the supply reaches. Never negative. */
  surplusPins: number;
}

export interface UnmeasurableBalance extends BalanceLineBase {
  /** At least one input arrives from off this planet, so nothing here is surplus. */
  status: 'inputs-not-local';
  missing: { typeId: number; name: string }[];
}

export type FactoryBalance = MeasuredBalance | UnmeasurableBalance;

/** Units an hour one pin of this schematic yields. */
function outputPerHour(typeId: number, pi: PiData): number | null {
  const schematic = pi.schematics[String(typeId)];
  if (!schematic || schematic.cycleTime <= 0) return null;
  return (schematic.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
}

/**
 * A colony's factories, each line measured against what this colony can
 * actually put into it. Lines come back in the order they were given, minus
 * any schematic the payload does not know.
 */
export function factoryBalance(input: FactoryBalanceInput, pi: PiData): FactoryBalance[] {
  const known = input.running.filter(
    (line) => pi.schematics[String(line.typeId)] !== undefined && line.pins > 0
  );

  // What this colony puts into the world: everything extracted, plus every
  // schematic's own output at the pin count it is running. Deliberately at the
  // built pin count rather than the fed one — a starved P1 line does under-feed
  // the P2 above it, but resolving that needs a fixed point over the graph and
  // would report a P2 surplus caused by a P1 shortage the pilot is about to
  // fix. Each line answers for its own inputs.
  const supply = new Map<number, number>(input.extractedPerHour);
  for (const line of known) {
    const rate = outputPerHour(line.typeId, pi);
    if (rate === null) continue;
    supply.set(line.typeId, (supply.get(line.typeId) ?? 0) + rate * line.pins);
  }

  // Total draw on each input across every schematic wanting it, so a shared
  // input can be split in proportion to the asking rather than counted twice.
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
      // This line's share of a contested input, in proportion to what it asked
      // for. With one claimant the share is the whole supply, which is the
      // case every reported colony is in.
      const share = total > 0 ? available * (mine / total) : available;
      supplyPerHour.push({ typeId: inputLine.typeID, name: inputLine.name, unitsPerHour: share });
      if (perPin > 0) feedablePins = Math.min(feedablePins, share / perPin);
    }

    // A schematic with no inputs cannot be starved by one.
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
