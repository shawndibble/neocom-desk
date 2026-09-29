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
  /**
   * True when this offer's contract carries more than one distinct for-sale
   * type (issue #1076) — `price` is a real ask, but for the whole contract,
   * not this blueprint. Absent/false for an ordinary single-type listing.
   */
  isMultiType?: boolean;
}

/** `AcquisitionResolution` minus `blueprintTypeID` — this module has no typeID of its own to report, only the caller (`recipes.ts`) knows it. */
export type BlueprintTierResult = Omit<AcquisitionResolution, 'blueprintTypeID'> & {
  /**
   * Runs the line's purchase brings in — Infinity for a BPO, every run of
   * every copy for BPCs. Set only when something is actually bought;
   * `claimBlueprintTier` credits whatever this node doesn't use back to the
   * pool, so a later node building with the same blueprint type uses what
   * the plan already paid for instead of buying it again.
   */
  purchasedRuns?: number;
};

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
  /**
   * Every other way to buy this blueprint the app can see — contract
   * originals, region market sell orders, LP Store redemptions — shaped as
   * offers. They compete on total cost with the listings above; absent is
   * the same as none.
   */
  extraOffers?: readonly BpcOffer[];
  /**
   * Offers considered only when nothing above prices the blueprint at all —
   * contracts in other regions, say. A plan quoted from a far-off listing
   * beats one that opens with no blueprint price when something is for sale.
   */
  lastResortOffers?: readonly BpcOffer[];
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
  return copiesToCover(shortfall, extend) * extend.price;
}

/** Whole copies it takes to cover `shortfall` runs — one for a BPO. */
function copiesToCover(shortfall: number, extend: { capacityRuns: number }): number {
  if (extend.capacityRuns === INFINITE_RUNS) return 1;
  return Math.ceil(shortfall / extend.capacityRuns);
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
 * BPC Sourcing is synced, untrusted data (a public contract archive) — a
 * listing with `runs: 0`/negative (anything but the -1 original sentinel) or
 * `quantity <= 0` is malformed, and `Math.ceil(shortfall / 0)` would silently
 * poison every cost this offer touches with Infinity/NaN rather than the "no
 * price" `null` every other bad-data path in this feature falls back to. A
 * multi-type offer (issue #1076) is not malformed — its price is a real ask —
 * but it is equally unusable here: `price` covers the whole contract, not
 * this blueprint, so it must not reseed a plan's ME/TE any more than a zeroed
 * `runs` should. Neither is a zero/negative price (issue #1080): a barter
 * contract's ISK side reads as 0, which must not win the cheapest-tier
 * candidate over a genuine, priced BPO.
 */
function usableOffers(offers: readonly BpcOffer[], allowFree = false): BpcOffer[] {
  return offers.filter(
    (offer) =>
      (offer.runs === -1 || offer.runs > 0) &&
      offer.quantity > 0 &&
      !offer.isMultiType &&
      (offer.price > 0 || (allowFree && offer.price === 0))
  );
}

/** The offer covering `shortfall` runs for the least ISK, or null when there are none. */
function cheapestToCover(offers: readonly BpcOffer[], shortfall: number): BpcOffer | null {
  let best: BpcOffer | null = null;
  let bestCost = Infinity;
  for (const offer of offers) {
    const cost = shortfallCost(Math.max(1, shortfall), offerToExtend(offer));
    if (cost < bestCost) {
      best = offer;
      bestCost = cost;
    }
  }
  return best;
}

/** Every ME/TE tier candidate for one buildable node, before pricing — the shared half of `tierOptions` and `selectBlueprintTier`. */
function buildCandidates(
  inputs: SelectBlueprintTierInputs,
  offers: readonly BpcOffer[]
): Candidate[] {
  const candidates = ownedTierCandidates(inputs.ownedCopies);
  // Each owned tier can only be extended by a matching-ME/TE offer — tiers
  // never mix within one node, so a differently-tiered offer cannot top one up.
  for (const candidate of candidates) {
    if (candidate.ownedRuns === INFINITE_RUNS) continue;
    const matching = offers.filter(
      (offer) => offer.me === candidate.me && offer.te === candidate.te
    );
    const best = cheapestToCover(matching, inputs.neededRuns - candidate.ownedRuns);
    if (best) candidate.extend = offerToExtend(best);
  }

  // One purchasable candidate per tier nothing owned already stands for, at
  // whichever offer covers the whole need cheapest there — a stack of 1-run
  // copies loses to one original at the same tier when the runs add up.
  // Every tier competes on total cost below, so a pricier high-ME copy still
  // wins when the materials it saves outweigh its price.
  const ownedTiers = new Set(candidates.map((c) => tierKey(c.me, c.te)));
  const byTier = new Map<string, BpcOffer[]>();
  for (const offer of offers) {
    const key = tierKey(offer.me, offer.te);
    if (ownedTiers.has(key)) continue;
    const list = byTier.get(key) ?? [];
    list.push(offer);
    byTier.set(key, list);
  }
  for (const tierOffers of byTier.values()) {
    const best = cheapestToCover(tierOffers, inputs.neededRuns)!;
    candidates.push({ me: best.me, te: best.te, ownedRuns: 0, extend: offerToExtend(best) });
  }

  return candidates;
}

/**
 * Everything purchasable in the ordinary pass: listed copies, the extra
 * sources, and the hub BPO sell price as an ME0 original. An extra offer may
 * be genuinely free — an LP redemption with no ISK side, at the default LP
 * Value of 0 — where a zero-ISK contract is a barter, not a price.
 */
function primaryOffers(inputs: SelectBlueprintTierInputs): BpcOffer[] {
  const bpo: BpcOffer[] =
    inputs.bpoSellPrice === null
      ? []
      : [{ me: 0, te: 0, runs: -1, quantity: 1, price: inputs.bpoSellPrice }];
  return [
    ...usableOffers([...inputs.bpcOffers, ...bpo]),
    ...usableOffers(inputs.extraOffers ?? [], true),
  ];
}

function priced(
  inputs: SelectBlueprintTierInputs,
  offers: readonly BpcOffer[]
): readonly TierOption[] {
  return buildCandidates(inputs, offers).map((candidate) => ({
    ...candidate,
    cost: candidateCost(candidate, inputs.neededRuns, inputs.materialCostAtMe),
  }));
}

/**
 * Every ME/TE tier a buildable node could be quoted at, each priced the same
 * way `selectBlueprintTier` prices its winner (issue #839 — the
 * picker/override modal lists these so a pilot can deliberately pick a tier
 * other than the cheapest, e.g. to use up a worse owned copy first).
 */
export function tierOptions(inputs: SelectBlueprintTierInputs): readonly TierOption[] {
  const primary = primaryOffers(inputs);
  const options = priced(inputs, primary);
  const lastResort = usableOffers(inputs.lastResortOffers ?? []);
  if (lastResort.length === 0 || options.some((o) => o.cost !== null)) return options;
  return priced(inputs, [...primary, ...lastResort]);
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
  // An owned copy that nothing can top up: the job cannot be started past the
  // copy's own runs, so report the real limit (issue #1775).
  const coverage =
    price === null && option.ownedRuns > 0
      ? { coveredRuns: option.ownedRuns, neededRuns }
      : undefined;
  const purchasedRuns = option.extend
    ? copiesToCover(shortfall, option.extend) * option.extend.capacityRuns
    : undefined;
  return {
    me: option.me,
    te: option.te,
    line: { unitPrice: price, owned: false },
    coverage,
    ...(purchasedRuns !== undefined ? { purchasedRuns } : {}),
  };
}

/**
 * Runs remaining per ME/TE tier for one blueprint type, shared across every
 * buildable node in a build-plan resolution pass that needs that same type —
 * the same "first claim wins the stock" contract `materialResolution.ts`'s
 * `ownedPool` applies to materials, but keyed per tier since a blueprint's
 * owned copies are not fungible across ME/TE the way material units are.
 */
export type OwnedBlueprintPool = Map<string, number>;

/**
 * Seeds `pool` from `copies` the first time this blueprint type is reached
 * (an empty pool), then returns every tier's *remaining* runs — reduced by
 * whatever an earlier node already claimed via `claimBlueprintTier` — shaped
 * as `SelectBlueprintTierInputs.ownedCopies` expects. A later call with the
 * same (already-seeded) pool ignores `copies` entirely, so callers can pass
 * the same raw owned-copies list every time without re-deriving it.
 */
export function pooledOwnedCopies(
  copies: readonly OwnedBlueprintCopy[],
  pool: OwnedBlueprintPool
): OwnedBlueprintCopy[] {
  if (pool.size === 0) {
    for (const candidate of ownedTierCandidates(copies)) {
      pool.set(tierKey(candidate.me, candidate.te), candidate.ownedRuns);
    }
  }
  return [...pool.entries()].map(([key, runs]) => {
    const [me, te] = key.split(':').map(Number);
    return { me, te, runs: runs === INFINITE_RUNS ? -1 : runs };
  });
}

/**
 * Claims whatever `resolved`'s winning tier actually used out of `pool`, so
 * the next node needing this same blueprint type sees the reduced remainder
 * instead of the same stock two branches both think they can use for free.
 * A BPO tier (`INFINITE_RUNS`) is never decremented — one original covers
 * every branch that reaches it.
 *
 * Whatever `resolved` bought (`purchasedRuns`) joins the pool too, less the
 * runs this node spends: once a plan has paid for a BPO, or for a BPC with
 * runs to spare, a later node needing the same blueprint builds with it
 * rather than buying it a second time. A no-op when nothing is owned at this
 * tier and nothing was bought (an unmatched override, say).
 */
export function claimBlueprintTier(
  pool: OwnedBlueprintPool,
  resolved: BlueprintTierResult,
  neededRuns: number
): void {
  const key = tierKey(resolved.me, resolved.te);
  const owned = pool.get(key);
  const purchased = resolved.purchasedRuns ?? 0;
  if (owned === undefined && purchased === 0) return;
  const available = (owned ?? 0) + purchased;
  if (available === INFINITE_RUNS) {
    pool.set(key, INFINITE_RUNS);
    return;
  }
  pool.set(key, available - Math.min(neededRuns, available));
}

/**
 * Picks the cheapest overall ME/TE tier for one buildable node: every tier
 * the Character owns any runs at, plus every tier something can be bought at
 * (listed copies, contract originals, the market, the LP Store, the hub BPO
 * sell price — last-resort offers only when none of those price it) — never
 * mixing tiers within
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
