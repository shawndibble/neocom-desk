/**
 * The other way to fix an idle factory: feed it.
 *
 * `factoryBalance.ts` measures that a colony's factories want more P0 than its
 * extractors deliver, and the Advisor's first answer was "remove the ones
 * nothing feeds". That is only half the trade, and on a colony whose card also
 * says *keep selling this P1 raw* it is the wrong half: every extra unit of P0
 * that reaches an idle factory is another P1 sold, so buying extraction beats
 * scrapping the capacity that would use it — when it fits.
 *
 * Whether it fits is the whole question, and it is a Powergrid question. An
 * Extractor Control Unit is 400 tf / 2,600 MW before a single head, and each
 * head is 110 tf / 550 MW. A Command Center level 5 colony running eight Basic
 * Industry Facilities has tens of thousands of tf spare and around 2,000 MW —
 * so CPU is never the binding side and the answer is usually "not until
 * something comes out". Saying that with the numbers attached is the advice;
 * silently recommending removal is what the pilot objected to.
 *
 * ## The head rate is measured, never assumed
 *
 * A new head yields what this colony's existing heads yield: total extraction
 * over head count, which `extraction.ts` has already decayed across the
 * program. There is no published richness figure to derive one from (see
 * `chain.ts`), so a colony with no extractor heads gets `unmeasurable` rather
 * than a guess.
 *
 * Pure: spare budget, infrastructure and measured rates are all parameters.
 */

import type { PiInfrastructure } from '@/sde/types';
import type { PinLoad } from './types';

/** CCP's cap on heads one Extractor Control Unit can drive. */
export const MAX_HEADS_PER_UNIT = 10;

export interface ExtractionUpgradeOptions {
  /** P0 an hour this colony's factories want beyond what it extracts. */
  shortfallPerHour: number;
  /** P0 an hour one existing head sustains — measured, decayed, never assumed. */
  perHeadPerHour: number | null;
  /** CPU and Powergrid free right now, net of everything including links. */
  spare: PinLoad;
  /** What a link a new pin needs costs here; null when unmeasurable. */
  newLinkCost: PinLoad | null;
  infrastructure: PiInfrastructure;
  /** Budget the idle factories would give back if removed instead. */
  freedByRemoval: PinLoad;
}

export interface ExtractionUpgrade {
  /**
   * `fits` — buying extraction closes some of the gap inside today's budget.
   * `needs-removal` — nothing fits now, but it would after the idle factories
   * come out, which makes the two options exclusive and worth stating as one
   * choice. `no-room` — not even then. `unmeasurable` — no head to rate.
   */
  status: 'fits' | 'needs-removal' | 'no-room' | 'unmeasurable';
  /** Heads that fit, and the control units to drive them. */
  heads: number;
  units: number;
  /** Heads that would close the shortfall completely, budget aside. */
  headsWanted: number;
  /** P0 an hour those heads add. */
  extraPerHour: number;
  /** What the whole addition draws. */
  load: PinLoad;
}

const EPSILON = 1e-9;

/** What `units` control units and `heads` heads cost, links included. */
function loadOf(
  units: number,
  heads: number,
  infrastructure: PiInfrastructure,
  newLinkCost: PinLoad | null
): PinLoad {
  const unit = infrastructure.pins.extractorControlUnit;
  const head = infrastructure.extractorHead;
  // A head hangs off its control unit and needs no link of its own; the
  // control unit needs one to reach the factories it feeds.
  const link = newLinkCost ?? { cpu: 0, powergrid: 0 };
  return {
    cpu: units * ((unit?.cpu ?? 0) + link.cpu) + heads * (head?.cpu ?? 0),
    powergrid: units * ((unit?.powergrid ?? 0) + link.powergrid) + heads * (head?.powergrid ?? 0),
  };
}

/** The most heads that fit in `budget`, driven by as few control units as possible. */
function fitHeads(
  budget: PinLoad,
  wanted: number,
  infrastructure: PiInfrastructure,
  newLinkCost: PinLoad | null
): { heads: number; units: number; load: PinLoad } {
  let best = { heads: 0, units: 0, load: { cpu: 0, powergrid: 0 } };
  for (let heads = 1; heads <= wanted; heads += 1) {
    const units = Math.ceil(heads / MAX_HEADS_PER_UNIT);
    const load = loadOf(units, heads, infrastructure, newLinkCost);
    if (load.cpu > budget.cpu + EPSILON || load.powergrid > budget.powergrid + EPSILON) break;
    best = { heads, units, load };
  }
  return best;
}

/**
 * Whether more extraction is the better answer than removal, and what it takes.
 *
 * Returns `no-room` rather than a zero-head plan so a caller never renders
 * "add 0 heads": the honest line there is that the colony is out of Powergrid,
 * which is a different sentence.
 */
export function extractionUpgrade(opts: ExtractionUpgradeOptions): ExtractionUpgrade {
  const { shortfallPerHour, perHeadPerHour, spare, infrastructure, newLinkCost } = opts;
  const none = { heads: 0, units: 0, extraPerHour: 0, load: { cpu: 0, powergrid: 0 } };

  if (
    perHeadPerHour === null ||
    !Number.isFinite(perHeadPerHour) ||
    perHeadPerHour <= 0 ||
    !Number.isFinite(shortfallPerHour) ||
    shortfallPerHour <= 0
  ) {
    return { status: 'unmeasurable', headsWanted: 0, ...none };
  }

  const headsWanted = Math.ceil(shortfallPerHour / perHeadPerHour - EPSILON);
  const now = fitHeads(spare, headsWanted, infrastructure, newLinkCost);
  if (now.heads > 0) {
    return {
      status: 'fits',
      headsWanted,
      heads: now.heads,
      units: now.units,
      extraPerHour: now.heads * perHeadPerHour,
      load: now.load,
    };
  }

  // Nothing fits today. Would it after the idle factories come out? That turns
  // two separate suggestions into one choice, which is what the pilot has to
  // make: the same Powergrid cannot hold both.
  const after = fitHeads(
    {
      cpu: spare.cpu + opts.freedByRemoval.cpu,
      powergrid: spare.powergrid + opts.freedByRemoval.powergrid,
    },
    headsWanted,
    infrastructure,
    newLinkCost
  );
  if (after.heads > 0) {
    return {
      status: 'needs-removal',
      headsWanted,
      heads: after.heads,
      units: after.units,
      extraPerHour: after.heads * perHeadPerHour,
      load: after.load,
    };
  }
  return { status: 'no-room', headsWanted, ...none };
}
