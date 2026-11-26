import type { AcquisitionCommunitySource, AcquisitionResolution } from '@/engine/industry/types';

export interface OwnedBlueprintCopy {
  me: number;
  te: number;
  runs: number;
}

export interface BpcOffer {
  me: number;
  te: number;
  runs: number;
  quantity: number;
  price: number;
  isMultiType?: boolean;
  community?: AcquisitionCommunitySource;
  invented?: true;
}

export type BlueprintTierResult = Omit<AcquisitionResolution, 'blueprintTypeID'> & {
  purchasedRuns?: number;
  copyOnly?: true;
};

export interface SelectBlueprintTierInputs {
  ownedCopies: readonly OwnedBlueprintCopy[];
  neededRuns: number;
  materialCostAtMe: (me: number) => number | null;
  bpcOffers: readonly BpcOffer[];
  bpoSellPrice: number | null;
  extraOffers?: readonly BpcOffer[];
  lastResortOffers?: readonly BpcOffer[];
  communityOffers?: readonly BpcOffer[];
  copyOnly?: boolean;
  assumedMeForUnowned: number;
}

interface Candidate {
  me: number;
  te: number;
  ownedRuns: number;
  extend: Extend | null;
}

interface Extend {
  capacityRuns: number;
  price: number;
  community?: AcquisitionCommunitySource;
  invented?: true;
}

export interface TierOption {
  me: number;
  te: number;
  ownedRuns: number;
  extend: Extend | null;
  cost: number | null;
}

const INFINITE_RUNS = Number.POSITIVE_INFINITY;

function tierKey(me: number, te: number): string {
  return `${me}:${te}`;
}

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

function offerToExtend(offer: BpcOffer): Extend {
  return {
    capacityRuns: offer.runs === -1 ? INFINITE_RUNS : offer.runs * offer.quantity,
    price: offer.price,
    ...(offer.community ? { community: offer.community } : {}),
    ...(offer.invented ? { invented: true as const } : {}),
  };
}

function shortfallCost(shortfall: number, extend: Extend): number {
  return copiesToCover(shortfall, extend) * extend.price;
}

function copiesToCover(shortfall: number, extend: { capacityRuns: number }): number {
  if (extend.capacityRuns === INFINITE_RUNS) return 1;
  return Math.ceil(shortfall / extend.capacityRuns);
}

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

function usableOffers(
  offers: readonly BpcOffer[],
  allowFree = false,
  copyOnly = false
): BpcOffer[] {
  return offers.filter(
    (offer) =>
      !(copyOnly && offer.runs === -1) &&
      (offer.runs === -1 || offer.runs > 0) &&
      offer.quantity > 0 &&
      !offer.isMultiType &&
      (offer.price > 0 || (allowFree && offer.price === 0))
  );
}

function cheapestToCover(offers: readonly BpcOffer[], shortfall: number): BpcOffer | null {
  let best: BpcOffer | null = null;
  let bestCost = Infinity;
  let bestCapacity = 0;
  for (const offer of offers) {
    const extend = offerToExtend(offer);
    const cost = shortfallCost(Math.max(1, shortfall), extend);
    if (cost < bestCost || (cost === bestCost && extend.capacityRuns > bestCapacity)) {
      bestCapacity = extend.capacityRuns;
      best = offer;
      bestCost = cost;
    }
  }
  return best;
}

function buildCandidates(
  inputs: SelectBlueprintTierInputs,
  offers: readonly BpcOffer[]
): Candidate[] {
  const candidates = ownedTierCandidates(inputs.ownedCopies);
  for (const candidate of candidates) {
    if (candidate.ownedRuns === INFINITE_RUNS) continue;
    const matching = offers.filter(
      (offer) => offer.me === candidate.me && offer.te === candidate.te
    );
    const best = cheapestToCover(matching, inputs.neededRuns - candidate.ownedRuns);
    if (best) candidate.extend = offerToExtend(best);
  }

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

function primaryOffers(inputs: SelectBlueprintTierInputs): BpcOffer[] {
  const bpo: BpcOffer[] =
    inputs.bpoSellPrice === null || inputs.copyOnly
      ? []
      : [{ me: 0, te: 0, runs: -1, quantity: 1, price: inputs.bpoSellPrice }];
  const community = usableOffers(inputs.communityOffers ?? [], true, inputs.copyOnly).map(
    (offer) => ({
      ...offer,
      price: 0,
    })
  );
  return [
    ...community,
    ...usableOffers([...inputs.bpcOffers, ...bpo], false, inputs.copyOnly),
    ...usableOffers(inputs.extraOffers ?? [], true, inputs.copyOnly),
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

export function tierOptions(inputs: SelectBlueprintTierInputs): readonly TierOption[] {
  const primary = primaryOffers(inputs);
  const options = priced(inputs, primary);
  const lastResort = usableOffers(inputs.lastResortOffers ?? [], false, inputs.copyOnly);
  if (lastResort.length === 0 || options.some((o) => o.cost !== null)) return options;
  return priced(inputs, [...primary, ...lastResort]);
}

export function resolveTierOption(option: TierOption, neededRuns: number): BlueprintTierResult {
  if (option.ownedRuns === INFINITE_RUNS) {
    return { me: option.me, te: option.te, line: null };
  }
  const shortfall = Math.max(0, neededRuns - option.ownedRuns);
  if (shortfall === 0) {
    return { me: option.me, te: option.te, line: { unitPrice: 0, owned: true } };
  }
  const copies = option.extend ? copiesToCover(shortfall, option.extend) : null;
  const price = option.extend ? option.extend.price : null;
  const coverage =
    price === null && option.ownedRuns > 0
      ? { coveredRuns: option.ownedRuns, neededRuns }
      : undefined;
  const purchasedRuns =
    option.extend && copies !== null ? copies * option.extend.capacityRuns : undefined;
  return {
    me: option.me,
    te: option.te,
    line: {
      unitPrice: price,
      owned: false,
      ...(copies !== null && copies > 1 ? { quantity: copies } : {}),
      ...(option.extend?.community ? { community: option.extend.community } : {}),
      ...(option.extend?.invented ? { invented: true as const } : {}),
    },
    coverage,
    ...(purchasedRuns !== undefined ? { purchasedRuns } : {}),
  };
}

export type OwnedBlueprintPool = Map<string, number>;

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

export function selectBlueprintTier(inputs: SelectBlueprintTierInputs): BlueprintTierResult {
  const options = tierOptions(inputs);

  if (options.length === 0) {
    if (inputs.copyOnly) {
      return { me: 0, te: 0, line: { unitPrice: null, owned: false }, copyOnly: true };
    }
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
