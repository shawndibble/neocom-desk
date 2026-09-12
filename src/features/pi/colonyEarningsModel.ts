/**
 * A built colony's current earnings, in the terms `engine/pi/colonyEarnings.ts`
 * takes — and a total across colonies (issue #956).
 *
 * `colonyEarnings` is deliberately dumb: it prices whatever map of typeID to
 * units/hr it is handed and knows nothing about pins, factories or extraction.
 * Building that map honestly is all the work this module does, and it is the
 * same translation role `factoryBalanceModel.ts` and `stopTierModel.ts` already
 * play for their own engines — ESI's shape in, the engine's parameters out.
 *
 * ## Net local consumption before crediting anything
 *
 * A colony that refines nothing earns on its extracted P0. A colony that
 * refines earns on its top tier, and the P0 it consumed is not separately
 * credited — crediting both would count material that never left the ground
 * twice. That rule is not a single subtraction: on a colony running Bacteria
 * (P1) into Test Cultures (P2) locally, the Bacteria consumed by the Test
 * Cultures line must be netted out of Bacteria's own output the same way a P0
 * consumed by a P1 line is, or a two-hop local chain double-counts the middle
 * tier. So this module builds one `produced` map (this colony's own raw
 * extraction, plus `colonyOutputPerHour`'s made-product lines) and one
 * `consumedLocally` map (every measured line's own `demandPerHour`, scaled
 * down to the *fed* pin count it is actually crediting output at, not the
 * built one — netting against the built rate would subtract more than this
 * colony has actually made), and reports only what survives the subtraction.
 *
 * ## A colony whose own extraction is unmeasurable earns nothing to report
 *
 * `factoryBalance.ts` marks a factory line `inputs-not-local` whenever any one
 * of its inputs is missing from `extractedPerHour` — deliberately agnostic to
 * *why* it is missing, because "this planet does not make it" and "this
 * planet's own extractor could not be projected" are both just "not in the
 * supply map" from where that module sits. `colonyOutputPerHour` then credits
 * an `inputs-not-local` line at its *built* pin count, which is exactly right
 * when the missing input is genuinely imported from a sibling planet — see
 * its own header.
 *
 * It is exactly wrong for the case this module has to rule out: a colony whose
 * extractor pins exist (`colony.extractors.length > 0`) but whose programs
 * could not be projected at all (`colony.extractedPerHour.length === 0`,
 * `advisorModel`'s own "unmeasured" convention). There, every local factory
 * line reads as `inputs-not-local` for want of a number this colony's own
 * ground should have supplied, and crediting the built rate would manufacture
 * a full ISK figure out of zero measurement — precisely the "no measured
 * extraction has no figure at all" rule the issue states outright. So that
 * case is refused before anything else runs, by handing `colonyEarnings` an
 * empty map; it already turns that into `iskPerHour: null` on its own.
 *
 * A colony with no extractor pins at all (`colony.extractors.length === 0`)
 * is a different, legitimate case — a factory colony fed entirely from a
 * sibling planet — and keeps `colonyOutputPerHour`'s built-pin convention.
 *
 * This module does not attempt to resolve a colony with *some* extractors
 * measured and others not; `extractedPerHour` reports what could be projected
 * per resource, and a resource missing from it is already excluded from the
 * supply map exactly as `factoryBalance.ts` intends.
 */

import type { PiData } from '@/sde/types';
import { colonyEarnings, type ColonyEarnings } from '@/engine/pi/colonyEarnings';
import type { BuiltColonyAdvice } from './advisorModel';
import { colonyFactoryBalance, colonyOutputPerHour } from './factoryBalanceModel';

/**
 * Same role as `factoryBalance.ts`'s own `EPSILON` and `chain.ts`'s
 * `CEIL_EPSILON`: absorbs float drift so a colony whose extraction exactly
 * saturates its own factories nets to true zero rather than a signed trace.
 * Relative to the produced rate rather than a fixed floor — see the call site.
 */
const NET_EPSILON = 1e-9;

export interface ColonyEarningsPrices {
  /** ISK per unit by typeID, the ask. A type the hub does not quote is absent, never zero. */
  prices: Readonly<Record<number, number>>;
  /** What the hub actually pays — its highest buy. Defaults to `prices`, whole-book. */
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
}

/**
 * What this colony's own ground puts out an hour, net of anything its own
 * factories eat of it — the one map `colonyEarnings` is built to price.
 */
export function saleableOutputPerHour(colony: BuiltColonyAdvice, pi: PiData): Map<number, number> {
  // This colony's own extraction exists but could not be projected at all —
  // see the module header. Every local factory line would otherwise read as
  // an imported one and be credited at its built pin count.
  if (colony.extractors.length > 0 && colony.extractedPerHour.length === 0) {
    return new Map();
  }

  const balance = colonyFactoryBalance(colony, pi);

  const produced = new Map<number, number>(
    colony.extractedPerHour.map((line) => [line.typeId, line.unitsPerHour])
  );
  for (const [typeId, unitsPerHour] of colonyOutputPerHour(balance, pi)) {
    produced.set(typeId, (produced.get(typeId) ?? 0) + unitsPerHour);
  }

  // Every measured line's own draw, scaled from `demandPerHour`'s built-pin
  // figure down to the fed pins it is actually crediting output at, then
  // summed per input across every line wanting it — the same input can feed
  // two schematics, same as `factoryBalance.ts`'s own sharing rule.
  const consumedLocally = new Map<number, number>();
  for (const line of balance) {
    if (line.status !== 'measured' || line.pins <= 0) continue;
    const fedPins = Math.min(line.pins, line.feedablePins);
    if (fedPins <= 0) continue;
    for (const input of line.demandPerHour) {
      const perPin = input.unitsPerHour / line.pins;
      consumedLocally.set(
        input.typeId,
        (consumedLocally.get(input.typeId) ?? 0) + perPin * fedPins
      );
    }
  }

  const saleable = new Map<number, number>();
  for (const [typeId, unitsPerHour] of produced) {
    const net = unitsPerHour - (consumedLocally.get(typeId) ?? 0);
    // Relative, not absolute: these rates run from 5 ISK ore to 21,201
    // units/hr, so a fixed floor would be too loose at the low end or too
    // tight at the high one. A colony whose extraction exactly saturates its
    // own factories nets to something like 4.5e-13 in float, not zero, and
    // without this a phantom trace of P0 the hub does not quote would land
    // in `unpriced` and suppress a real colony's earnings line for it.
    if (net > unitsPerHour * NET_EPSILON) saleable.set(typeId, net);
  }
  return saleable;
}

/** This colony's current earnings, priced at hub rates. */
export function builtColonyEarnings(
  colony: BuiltColonyAdvice,
  pi: PiData,
  priceOpts: ColonyEarningsPrices
): ColonyEarnings {
  const saleable = saleableOutputPerHour(colony, pi);
  return colonyEarnings({ saleableOutputPerHour: saleable, ...priceOpts }, pi);
}

export interface TotalColonyEarnings {
  /** Sum of every colony's `iskPerHour` that had one. Null when none did. */
  iskPerHour: number | null;
  /** Union of every colony's `unpriced` typeIDs, deduplicated. */
  unpriced: number[];
  /**
   * How many colonies contributed no figure at all — no measured extraction —
   * and so are absent from the sum above rather than folded in as zero. A
   * caller summing four colonies where one of them is `null` must say so
   * rather than silently presenting the other three's total as the whole
   * operation's.
   */
  coloniesWithoutFigure: number;
}

/**
 * A total across colonies. Never a bare number: summing a `null` colony as
 * zero would be the exact "partial total presented as a whole" the issue
 * refuses everywhere else, so a colony with no figure is counted, named, and
 * left out of the sum instead.
 */
export function totalColonyEarnings(perColony: readonly ColonyEarnings[]): TotalColonyEarnings {
  let total = 0;
  let havePriced = false;
  let coloniesWithoutFigure = 0;
  const unpriced = new Set<number>();

  for (const entry of perColony) {
    if (entry.iskPerHour === null) {
      coloniesWithoutFigure += 1;
    } else {
      total += entry.iskPerHour;
      havePriced = true;
    }
    for (const typeId of entry.unpriced) unpriced.add(typeId);
  }

  return {
    iskPerHour: havePriced ? total : null,
    unpriced: [...unpriced],
    coloniesWithoutFigure,
  };
}
