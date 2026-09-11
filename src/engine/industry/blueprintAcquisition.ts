/**
 * Blueprint Acquisition (issue #838): which ME/TE tier a buildable node
 * should be quoted at, and what it costs to cover whatever shortfall that
 * tier leaves — replacing `findOwnedBlueprint`'s old "BPO always wins, else
 * highest-ME BPC" heuristic with a cost-minimizing one
 * (docs/context/decisions/20260911-073307).
 *
 * Pure and decoupled from ESI/BPC Sourcing's own types, the same way
 * `engine/contracts/bpcSearch.ts`'s `OwnedBlueprintInput` stays decoupled —
 * a caller adapts `CharacterBlueprint`/`BpcContractRow` into the shapes here.
 */

/** One owned copy of a blueprint. */
export interface OwnedBlueprintCopy {
  me: number;
  te: number;
  /** -1 = an original (BPO): unlimited runs. Positive = a copy's remaining runs. */
  runs: number;
}

/** One listing this blueprint could be bought at — a BPC Sourcing contract row's relevant fields. */
export interface BpcOffer {
  me: number;
  te: number;
  /** -1 = an original sold via contract: unlimited runs, one copy covers any shortfall. */
  runs: number;
  price: number;
}

/** What a node's Blueprint Acquisition row should show, or `null` for no row at all. */
export interface AcquisitionLine {
  /** ISK to cover the shortfall at the resolved tier; 0 when fully covered by owned runs. */
  unitPrice: number | null;
  /** True when the resolved tier's owned runs already cover the need — nothing bought. */
  owned: boolean;
}

export interface BlueprintTierResult {
  me: number;
  te: number;
  /** `null` only when the resolved tier is an owned BPO — infinite runs, nothing to ever acquire. */
  line: AcquisitionLine | null;
}

export interface SelectBlueprintTierInputs {
  /** Every copy of this blueprint type the Character owns, at any ME/TE. */
  ownedCopies: readonly OwnedBlueprintCopy[];
  /** Runs this node needs covered. */
  neededRuns: number;
  /** This blueprint's own material cost at a candidate ME, for `neededRuns` runs; null = unpriceable at that ME. */
  materialCostAtMe: (me: number) => number | null;
  /**
   * Listings for this exact blueprint type, already narrowed to the node's
   * own Trade Hub region. Empty for a reaction node — reaction formulas
   * cannot be copied, so BPC Sourcing is never searched for one.
   */
  bpcOffers: readonly BpcOffer[];
  /** The BPO's ordinary sell price at the node's hub; null if unpriced there. */
  bpoSellPrice: number | null;
  /** ME to quote when nothing is owned and nothing can be bought — mirrors `assumedMeForUnowned`. */
  assumedMeForUnowned: number;
}

interface Candidate {
  me: number;
  te: number;
  /** Runs already covered before buying anything; Infinity for a BPO. */
  ownedRuns: number;
  /** How to extend this exact tier by buying more, if anything can. */
  extend: { capacityRuns: number; price: number } | null;
}

const INFINITE_RUNS = Number.POSITIVE_INFINITY;

function tierKey(me: number, te: number): string {
  return `${me}:${te}`;
}

/** Groups owned copies into one candidate per distinct ME/TE tier, runs summed (any -1 makes the whole tier infinite). */
function ownedTierCandidates(copies: readonly OwnedBlueprintCopy[]): Candidate[] {
  const byTier = new Map<string, Candidate>();
  for (const copy of copies) {
    const key = tierKey(copy.me, copy.te);
    const existing = byTier.get(key);
    const runsHere = copy.runs === -1 ? INFINITE_RUNS : copy.runs;
    if (!existing) {
      byTier.set(key, { me: copy.me, te: copy.te, ownedRuns: runsHere, extend: null });
      continue;
    }
    existing.ownedRuns =
      existing.ownedRuns === INFINITE_RUNS || runsHere === INFINITE_RUNS
        ? INFINITE_RUNS
        : existing.ownedRuns + runsHere;
  }
  return [...byTier.values()];
}

/** Cheapest offer among `offers`, or null when there are none. */
function cheapestOffer(offers: readonly BpcOffer[]): BpcOffer | null {
  if (offers.length === 0) return null;
  return offers.reduce((best, offer) => (offer.price < best.price ? offer : best));
}

function offerToExtend(offer: BpcOffer): { capacityRuns: number; price: number } {
  return { capacityRuns: offer.runs === -1 ? INFINITE_RUNS : offer.runs, price: offer.price };
}

/** Whole copies needed to cover `shortfall` runs at `extend`'s capacity/price — never a fractional-copy price. */
function shortfallCost(shortfall: number, extend: { capacityRuns: number; price: number }): number {
  if (extend.capacityRuns === INFINITE_RUNS) return extend.price;
  return Math.ceil(shortfall / extend.capacityRuns) * extend.price;
}

/** This candidate's total plan cost, or null when unpriceable (bad ME price, or a shortfall nothing can cover). */
function candidateCost(
  candidate: Candidate,
  neededRuns: number,
  materialCostAtMe: (me: number) => number | null
): number | null {
  const materialCost = materialCostAtMe(candidate.me);
  if (materialCost === null) return null;
  const shortfall =
    candidate.ownedRuns === INFINITE_RUNS ? 0 : Math.max(0, neededRuns - candidate.ownedRuns);
  if (shortfall === 0) return materialCost;
  if (!candidate.extend) return null;
  return materialCost + shortfallCost(shortfall, candidate.extend);
}

/**
 * Picks the cheapest overall ME/TE tier for one buildable node: every tier
 * the Character owns any runs at, plus the cheapest purchasable tier (BPC
 * Sourcing first, else the BPO's own sell price) — never mixing tiers within
 * one node. See docs/context/decisions/20260911-073307 for the full design.
 */
export function selectBlueprintTier(inputs: SelectBlueprintTierInputs): BlueprintTierResult {
  const {
    ownedCopies,
    neededRuns,
    materialCostAtMe,
    bpcOffers,
    bpoSellPrice,
    assumedMeForUnowned,
  } = inputs;

  const candidates = ownedTierCandidates(ownedCopies);
  // Each owned tier can only be extended by a matching-ME/TE offer — tiers
  // never mix within one node, so a differently-tiered offer cannot top one up.
  for (const candidate of candidates) {
    const matching = bpcOffers.filter(
      (offer) => offer.me === candidate.me && offer.te === candidate.te
    );
    const best = cheapestOffer(matching);
    if (best) candidate.extend = offerToExtend(best);
  }

  // The one additional "cheapest purchasable tier" candidate: BPC Sourcing's
  // cheapest listing at any tier, else the BPO's own sell price at ME0/TE0.
  const cheapestListing = cheapestOffer(bpcOffers);
  if (cheapestListing) {
    candidates.push({
      me: cheapestListing.me,
      te: cheapestListing.te,
      ownedRuns: 0,
      extend: offerToExtend(cheapestListing),
    });
  } else if (bpoSellPrice !== null) {
    candidates.push({
      me: 0,
      te: 0,
      ownedRuns: 0,
      extend: { capacityRuns: INFINITE_RUNS, price: bpoSellPrice },
    });
  }

  if (candidates.length === 0) {
    return { me: assumedMeForUnowned, te: 0, line: { unitPrice: null, owned: false } };
  }

  let winner = candidates[0];
  let winnerCost = candidateCost(winner, neededRuns, materialCostAtMe);
  for (const candidate of candidates.slice(1)) {
    const cost = candidateCost(candidate, neededRuns, materialCostAtMe);
    if (cost !== null && (winnerCost === null || cost < winnerCost)) {
      winner = candidate;
      winnerCost = cost;
    }
  }

  if (winner.ownedRuns === INFINITE_RUNS) {
    return { me: winner.me, te: winner.te, line: null };
  }

  const shortfall = Math.max(0, neededRuns - winner.ownedRuns);
  if (shortfall === 0) {
    return { me: winner.me, te: winner.te, line: { unitPrice: 0, owned: true } };
  }
  const price = winner.extend ? shortfallCost(shortfall, winner.extend) : null;
  return { me: winner.me, te: winner.te, line: { unitPrice: price, owned: false } };
}
