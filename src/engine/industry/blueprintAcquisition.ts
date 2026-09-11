/**
 * Blueprint Acquisition (issue #838): which ME/TE tier a buildable node
 * should be quoted at, and what it costs to cover whatever shortfall that
 * tier leaves — replacing `findOwnedBlueprint`'s old "BPO always wins, else
 * highest-ME BPC" heuristic with a cost-minimizing one
 * (docs/context/decisions/20260911-073307).
 *
 * Decoupled from ESI/BPC Sourcing's own types, the same way
 * `engine/contracts/bpcSearch.ts`'s `OwnedBlueprintInput` stays decoupled —
 * a caller adapts `CharacterBlueprint`/`BpcContractRow` into the shapes here.
 */
import type { AcquisitionResolution } from '@/engine/industry/types';

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
  /** Copies this one listing bundles at its combined `price` — a contract can list several at once (`engine/contracts/bpcSearch.ts`'s own `BlueprintOfferStats` doc comment). 1 for an ordinary single-copy listing. */
  quantity: number;
  price: number;
}

/** `AcquisitionResolution` minus `blueprintTypeID` — this module has no typeID of its own to report, only the caller (`recipes.ts`) knows it. */
export type BlueprintTierResult = Omit<AcquisitionResolution, 'blueprintTypeID'>;

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

/**
 * One ME/TE tier a buildable node could be quoted at, with its total plan
 * cost (issue #839 — the picker/override modal lists every one of these,
 * not just `selectBlueprintTier`'s cheapest). `cost` is the same number
 * `candidateCost` uses to pick a winner: material cost at this tier plus
 * whatever covering the shortfall costs, or `null` when unpriceable.
 */
export interface TierOption {
  me: number;
  te: number;
  /** Runs already covered before buying anything; Infinity for a BPO. */
  ownedRuns: number;
  /** How to extend this exact tier by buying more, if anything can. */
  extend: { capacityRuns: number; price: number } | null;
  cost: number | null;
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
  return {
    // A listing's combined `quantity` copies all come with the one contract
    // at its one `price` — buying it whole nets every run all of them carry,
    // not just one copy's worth.
    capacityRuns: offer.runs === -1 ? INFINITE_RUNS : offer.runs * offer.quantity,
    price: offer.price,
  };
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

/** Every ME/TE tier candidate for one buildable node, before pricing — the shared half of `tierOptions` and `selectBlueprintTier`. */
function buildCandidates(inputs: SelectBlueprintTierInputs): Candidate[] {
  const { ownedCopies, bpoSellPrice } = inputs;

  // BPC Sourcing is synced, untrusted data (a public contract archive) — a
  // listing with `runs: 0`/negative (anything but the -1 original sentinel)
  // or `quantity <= 0` is malformed, and `Math.ceil(shortfall / 0)` would
  // silently poison every cost this offer touches with Infinity/NaN rather
  // than the "no price" `null` every other bad-data path in this feature
  // falls back to.
  const bpcOffers = inputs.bpcOffers.filter(
    (offer) => (offer.runs === -1 || offer.runs > 0) && offer.quantity > 0
  );

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

  return candidates;
}

/**
 * Every ME/TE tier a buildable node could be quoted at, each priced the same
 * way `selectBlueprintTier` prices its winner (issue #839 — the
 * picker/override modal lists these so a pilot can deliberately pick a tier
 * other than the cheapest, e.g. to use up a worse owned copy first).
 */
export function tierOptions(inputs: SelectBlueprintTierInputs): readonly TierOption[] {
  return buildCandidates(inputs).map((candidate) => ({
    ...candidate,
    cost: candidateCost(candidate, inputs.neededRuns, inputs.materialCostAtMe),
  }));
}

/**
 * What a specific tier resolves to for a node needing `neededRuns` — the same
 * owned/shortfall logic `selectBlueprintTier` applies to its winner, exposed
 * so the picker/override modal can resolve whichever `TierOption` the pilot
 * picks, not only the cheapest.
 */
export function resolveTierOption(option: TierOption, neededRuns: number): BlueprintTierResult {
  if (option.ownedRuns === INFINITE_RUNS) {
    return { me: option.me, te: option.te, line: null };
  }
  const shortfall = Math.max(0, neededRuns - option.ownedRuns);
  if (shortfall === 0) {
    return { me: option.me, te: option.te, line: { unitPrice: 0, owned: true } };
  }
  const price = option.extend ? shortfallCost(shortfall, option.extend) : null;
  return { me: option.me, te: option.te, line: { unitPrice: price, owned: false } };
}

/**
 * Picks the cheapest overall ME/TE tier for one buildable node: every tier
 * the Character owns any runs at, plus the cheapest purchasable tier (BPC
 * Sourcing first, else the BPO's own sell price) — never mixing tiers within
 * one node. See docs/context/decisions/20260911-073307 for the full design.
 */
export function selectBlueprintTier(inputs: SelectBlueprintTierInputs): BlueprintTierResult {
  const options = tierOptions(inputs);

  if (options.length === 0) {
    return { me: inputs.assumedMeForUnowned, te: 0, line: { unitPrice: null, owned: false } };
  }

  let winner = options[0];
  for (const option of options.slice(1)) {
    if (option.cost !== null && (winner.cost === null || option.cost < winner.cost)) {
      winner = option;
    }
  }

  return resolveTierOption(winner, inputs.neededRuns);
}
