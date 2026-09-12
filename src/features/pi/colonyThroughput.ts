/**
 * A built colony's own hours-to-full — `engine/pi/checkThroughput`'s buffer
 * arithmetic, run against a colony that already exists (issue #958).
 *
 * ## Only from-scratch layouts were ever checked
 *
 * `stopTierModel.ts` runs `checkThroughput` for every hypothetical rebuild
 * candidate a planet could host. The colony the pilot actually owns never
 * goes through it: nothing in this app has ever asked "at this colony's own
 * measured rates, how long until its launchpad and storage are full". That is
 * the gap this module closes.
 *
 * ## Why this can't just call `checkThroughput` with a `chain` off `chain.ts`
 *
 * `checkThroughput` takes a `PiChain` — one factory's ratio expanded — and a
 * `blocks` count, because a hypothetical layout is a repeated ratio block.
 * A built colony is not a ratio block: its extraction and its factories were
 * placed by hand and may not be in any tidy ratio at all (`factoryBalance.ts`
 * exists precisely because real colonies drift out of ratio). So this module
 * builds a `PiChain` shaped like *this specific colony* — one node per
 * resource it actually extracts, one node per product its factories actually
 * make (`factoryBalanceModel.ts`'s `colonyOutputPerHour`, the same *fed*
 * rate the production card already trusts) — and calls `checkThroughput`
 * once on it with `blocks: 1`, since every node's `unitsPerHour` is already
 * the colony's own whole-colony total rather than one block's share of it.
 * The buffer half of the arithmetic is untouched: `pins` is this colony's own
 * `pinLoad.counts`, so the launchpad and storage capacities `checkThroughput`
 * sums are exactly what `pinBudget.ts`'s pin-fit meter already reports for
 * this colony.
 *
 * ## Mean and peak measure the same colony through two different chains
 *
 * `BuiltColonyAdvice.extractedPerHour` is `engine/pi/extraction.ts`'s
 * `sustainedRatePerHour` — a program's whole life averaged over CCP's decay
 * curve. A fresh program runs far above that average on its first day
 * (`peakRatePerHour` below), so a buffer sized off the mean can pass a colony
 * that in fact overflows before the mean has ever applied. This module
 * therefore builds *two* chains off the same colony — one at each extractor's
 * measured mean, one at each extractor's own peak — and returns both
 * `ThroughputCheck`s rather than picking one, because a caller deciding what
 * to show a pilot needs to know when they disagree, not just the answer that
 * happens to look better.
 *
 * The peak chain cannot be built from `BuiltColonyAdvice` alone:
 * `MeasuredExtractor` (`advisorModel.ts`) carries only the mean rate, and
 * peak/mean is not a fixed ratio — `qty_per_cycle` enters CCP's noise term
 * (`Math.pow(qtyPerCycle, 0.7)`), so two extractors with the same mean can
 * have different peaks. Deriving it needs each extractor's own install-time
 * baseline, which `builtAdvice` reads off the colony's raw ESI pins and then
 * discards. So this module takes those raw pins as a second, explicit
 * argument alongside the `BuiltColonyAdvice` they built — the same
 * `CharacterPlanetDetail.pins` `advisorModel.ts`'s `builtAdvice` already had
 * in hand at the point it built `colony`.
 *
 * Only the extraction leg gets a peak: a factory's own output is capped by
 * its cycle time, not by CCP's decay curve, so `colonyOutputPerHour`'s figure
 * is the same on both chains.
 *
 * The per-product peak sum below deliberately mirrors the exact filter
 * `advisorModel.ts`'s `measureExtractors`/`builtAdvice` apply when building
 * `extractedPerHour` — product resolvable off the pin, program carries a full
 * yield baseline — because the mean and the peak have to be sums over the
 * *same* set of extractors to mean anything held up against each other; a
 * peak measured over a different extractor set than the mean would make the
 * comparison meaningless rather than merely approximate. `advisorModel.ts` is
 * not owned by this change, so that filter is duplicated here rather than
 * shared, and the "same extractor set" test below is what keeps the
 * duplicate honest.
 */

import type { PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { extractorProgramsFromPins } from './adapters';
import { checkThroughput } from '@/engine/pi/pinBudget';
import { extractorCycleYields, hasYieldBaseline, programCycleCount } from '@/engine/pi/extraction';
import type { ExtractorYieldProgram, PiChain, ThroughputCheck } from '@/engine/pi/types';
import { piTier } from '@/engine/pi/chain';
import { colonyFactoryBalance, colonyOutputPerHour } from './factoryBalanceModel';
import type { BuiltColonyAdvice } from './advisorModel';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * An extractor's own peak sustained rate: its first day of output, averaged
 * over the 24 hours it actually spans — never a longer window than the
 * program itself runs, for a program shorter than a day.
 *
 * Read off `extractorCycleYields` rather than a single cycle's yield, for the
 * same reason `engine/pi/extraction.ts`'s own `fractionOfFirstDayRate` reads a
 * day rather than a cycle: CCP's three cosine terms swing adjacent cycles
 * hard enough that a single cycle crosses any given threshold well before a
 * day of output does (that module's own header). A "peak" measured off one
 * noisy 30-minute bar would be an artifact of where in the ripple that bar
 * happened to land; a day's worth of bars is what a buffer actually has to
 * absorb.
 *
 * Not a fixed multiple of `sustainedRatePerHour`: `qty_per_cycle` enters
 * CCP's noise term, so the peak/mean ratio is a property of one program's own
 * parameters, never a constant this module could hardcode.
 */
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

/**
 * Every extractor pin's own product and peak rate, summed per product —
 * built off the colony's raw ESI pins because `BuiltColonyAdvice` does not
 * carry the install-time baseline a peak needs. Mirrors
 * `advisorModel.ts`'s `measureExtractors`/`builtAdvice` filter exactly (see
 * this module's header): a pin without a resolvable product, or a program
 * without a full yield baseline, is left out here the same way it is left
 * out of `extractedPerHour`.
 */
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

/**
 * A one-block chain shaped like this colony's own measured flow: one tier-0
 * node per resource it extracts, one node per product its factories actually
 * make, at whichever set of extraction rates the caller is measuring
 * (`extractedPerHour`, mean or peak). `checkThroughput` reads only `tier`,
 * `typeId` and `unitsPerHour` off each node, so every other `ChainNode` field
 * is a harmless placeholder — this chain is never expanded or costed the way
 * a hypothetical rebuild's chain is.
 */
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
  /**
   * The same raw ESI pins `colony` was built from
   * (`CharacterPlanetDetail.pins`) — needed for the peak leg only; see this
   * module's header for why `BuiltColonyAdvice` alone cannot supply it.
   */
  pins: readonly PlanetPin[];
  pi: PiData;
  linkCapacityPerHour: number | null;
  bufferHours: number;
}

export interface ColonyThroughputResult {
  /** The buffer check at this colony's measured, whole-program-average rates. */
  mean: ThroughputCheck;
  /**
   * The same check at each extractor's own first-day rate — the one to plan
   * a buffer against, since a fresh program runs here long before it ever
   * runs at `mean`'s rate.
   */
  peak: ThroughputCheck;
}

/**
 * This colony's own hours-to-full, at its measured mean and at its
 * extractors' peak.
 */
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
