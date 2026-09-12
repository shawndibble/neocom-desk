/**
 * The three numbers a BPC Sourcing **Offer** is actually judged on — its ME,
 * TE and runs — carried from the row's context menu to `/industry` so the plan
 * it opens is a quote for *that copy* rather than for a hypothetical one
 * (issue #637). This reverses #636's "the plan is not seeded" bullet.
 *
 * All-or-nothing on purpose: an Offer always has all three, so a query
 * carrying only some of them is a hand-edited or truncated URL, not a
 * half-seeded intent. Missing one means no seed at all, and the unseeded
 * `?product=` path (Market Browser, Assets, appraised rows) behaves exactly
 * as it did before.
 */

/** ME/TE/runs to open a Build Plan at, in place of every default. */
export interface BuildPlanSeed {
  me: number;
  te: number;
  runs: number;
}

/** Query keys a seed occupies. Nothing else on `/industry` uses these. */
const SEED_KEYS = ['me', 'te', 'runs'] as const;

/** The subset of `URLSearchParams` a read needs — so a caller can pass one directly. */
type ParamReader = Pick<URLSearchParams, 'get'>;

/**
 * Parsed strictly, and never clamped. `Industry`'s create-if-missing effect
 * stops re-firing only once the plan it wrote matches the seed it was given,
 * so a value silently adjusted on the way in — clamped, rounded, coerced from
 * `''` to 0 — would leave the two permanently disagreeing and write a plan
 * per render. Reject instead: out-of-range is no seed, and the plan opens at
 * the ordinary defaults.
 */
function parseSeedNumber(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

export function parsePlanSeed(params: ParamReader): BuildPlanSeed | null {
  // The game's own bounds, the ones `BuildPlanRecord.me`/`.te` document and
  // the detail pane's inputs enforce.
  const me = parseSeedNumber(params.get('me'), 0, 10);
  const te = parseSeedNumber(params.get('te'), 0, 20);
  // An Offer is always a copy (`is_blueprint_copy`), so runs is at
  // least 1 — an original's ESI runs of -1 never reaches here, and a zero-run
  // plan builds nothing.
  const runs = parseSeedNumber(params.get('runs'), 1, Number.MAX_SAFE_INTEGER);
  if (me === null || te === null || runs === null) return null;
  return { me, te, runs };
}

/** Writes a seed onto a query being built. A null seed writes nothing. */
export function applyPlanSeed(params: URLSearchParams, seed: BuildPlanSeed | null): void {
  if (!seed) return;
  params.set('me', String(seed.me));
  params.set('te', String(seed.te));
  params.set('runs', String(seed.runs));
}

/**
 * Removes every seed key. Used where `?product=` is cleared: the seed is spent
 * once the plan exists, and a leftover `me`/`te`/`runs` would ride along on
 * the next param rewrite (`?material=` preserves what it does not delete).
 */
export function clearPlanSeed(params: URLSearchParams): void {
  for (const key of SEED_KEYS) params.delete(key);
}

/**
 * A seed from one BPC contract item line — a structural subset of
 * `PublicContractItem`, not that type itself, to keep this module decoupled
 * from `@/esi/endpoints`. Same all-or-nothing rule as `parsePlanSeed`: ESI
 * can omit any one of the three, and quoting a copy as unresearched because
 * a field was absent is worse than falling back to unseeded.
 */
export function seedFromContractItem(item: {
  is_blueprint_copy?: boolean;
  material_efficiency?: number;
  time_efficiency?: number;
  runs?: number;
}): BuildPlanSeed | null {
  if (!item.is_blueprint_copy) return null;
  const { material_efficiency: me, time_efficiency: te, runs } = item;
  if (me === undefined || te === undefined || runs === undefined) return null;
  return { me, te, runs };
}

/**
 * `seedFromContractItem`'s rule against a Public Contract Offers snapshot row.
 * A near-twin rather than a shared helper only because the snapshot renames
 * ESI's fields as it publishes (`material_efficiency` -> `me`,
 * `time_efficiency` -> `te`). The rule must stay identical: since #933 one
 * Contract Search line is reachable by both menus, and a copy seeded
 * differently per path would open as two plans.
 *
 * No `runs === -1` guard like BPC Sourcing's — the publisher drops a negative
 * `runs`, so a BPO arrives absent-runs and falls out unseeded.
 */
export function seedFromOfferRow(row: {
  isBlueprintCopy?: boolean;
  me?: number;
  te?: number;
  runs?: number;
}): BuildPlanSeed | null {
  if (!row.isBlueprintCopy) return null;
  const { me, te, runs } = row;
  if (me === undefined || te === undefined || runs === undefined) return null;
  return { me, te, runs };
}

/**
 * Whether an existing plan is the one a seeded click already created.
 *
 * Matched on the three values rather than on a marker stored on the plan:
 * browsing back to the same Offer then reuses the plan instead of piling up
 * duplicates, while a plan for the same blueprint at *different* research is
 * left untouched and the seeded one is created beside it. The consequence,
 * taken knowingly: edit a seeded plan's ME and the next click on that Offer
 * creates a fresh plan, because the old one no longer describes that copy.
 */
export function matchesPlanSeed(plan: BuildPlanSeed, seed: BuildPlanSeed): boolean {
  return plan.me === seed.me && plan.te === seed.te && plan.runs === seed.runs;
}
