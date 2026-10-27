/**
 * EVE's post-March-2020 order-price rule: a market order price may carry at
 * most four significant figures (1,233,000 ISK is legal, 1,233,456 is not),
 * with a hard 0.01 ISK floor below which no order can price at all.
 *
 * `priceTick(p)` is the smallest legal increment at `p`'s own magnitude —
 * the unit every other function here rounds to. Every function below returns
 * `null`, never `NaN` or a clamped garbage value, for non-finite or
 * non-positive input: there is no legal price to report for "negative ISK".
 *
 * Worked in integer CENTS throughout, dividing back to ISK only at the very
 * final step, so a result lands on the exact double a literal would produce
 * — `undercutPrice(1000) === 999.9`, never `999.8999999999999`. `Math.log10`
 * is avoided entirely for the same reason: it drifts at exact powers of ten
 * on some inputs, where `p.toExponential()` is guaranteed correctly rounded.
 */

/** Guards the cents conversion against float noise from `p * 100` landing a
 *  hair on the wrong side of an intended whole cent — see `chain.ts`'s
 *  `CEIL_EPSILON` / `pinBudget.ts`'s `FLOOR_EPSILON` for the same pattern. */
const CENTS_EPSILON = 1e-7;

/** `floor(log10(p))`, read off the correctly-rounded exponential form. */
function exponentOf(p: number): number {
  const [, exp] = p.toExponential().split('e');
  return Number(exp);
}

/**
 * The tick size in integer CENTS for a price whose exponent is `e`. Four
 * significant figures at exponent `e` is a step of `10^(e-3)` ISK, i.e.
 * `10^(e-1)` cents; below `e = 1` that underflows a whole cent, so it clamps
 * to 1 (the 0.01 ISK minimum tick) rather than going sub-cent.
 */
function tickCentsForExponent(e: number): number {
  return e >= 1 ? 10 ** (e - 1) : 1;
}

function legalOrNull(p: number): number | null {
  return Number.isFinite(p) && p > 0 ? p : null;
}

/** The smallest legal increment at `p`'s own magnitude, in ISK. */
export function priceTick(p: number): number | null {
  if (legalOrNull(p) === null) return null;
  return tickCentsForExponent(exponentOf(p)) / 100;
}

/**
 * The largest legal price at or below `p` — `null` when there is none, i.e.
 * `p` itself sits below the hard 0.01 ISK floor (a sub-cent input rounds
 * down to 0 cents, which is not a legal price to report).
 */
export function roundPriceDown(p: number): number | null {
  if (legalOrNull(p) === null) return null;
  const tickCents = tickCentsForExponent(exponentOf(p));
  const pCents = Math.floor(p * 100 + CENTS_EPSILON);
  if (pCents < 1) return null;
  return (Math.floor(pCents / tickCents) * tickCents) / 100;
}

/**
 * The smallest legal price at or above `p` — the safety-floor direction:
 * never below the true value, even when `p` itself carries sub-cent noise
 * from its own upstream division. Never below the hard 0.01 ISK minimum
 * either: a positive input tinier than half a cent (`p < CENTS_EPSILON`)
 * would otherwise `Math.ceil` to `-0` — not a legal price, and not `null`
 * either since `legalOrNull` already accepted `p` — so `pCents` is floored
 * at 1 (0.01 ISK), the smallest legal price at or above ANY positive input.
 */
export function roundPriceUp(p: number): number | null {
  if (legalOrNull(p) === null) return null;
  const tickCents = tickCentsForExponent(exponentOf(p));
  const pCents = Math.max(1, Math.ceil(p * 100 - CENTS_EPSILON));
  return (Math.ceil(pCents / tickCents) * tickCents) / 100;
}

/**
 * The largest legal price strictly below `rival` — one tick under, for
 * beating a seller. `rival` is assumed already legal (a real order's price).
 *
 * At an exact power of ten (`rival` sits at the FLOOR of its own band, e.g.
 * 1,000 or 10.00) the band just below uses a smaller tick — undercutting
 * 1,000 lands on 999.9, not 999 — so this reads the tick one exponent down
 * only in that boundary case; everywhere else `rival`'s own tick applies.
 */
export function undercutPrice(rival: number): number | null {
  if (legalOrNull(rival) === null) return null;
  const e = exponentOf(rival);
  const rivalCents = Math.round(rival * 100);
  const bandStartCents = Math.round(10 ** e * 100);
  const stepCents =
    rivalCents === bandStartCents ? tickCentsForExponent(e - 1) : tickCentsForExponent(e);
  const resultCents = rivalCents - stepCents;
  return resultCents < 1 ? null : resultCents / 100;
}

/**
 * The smallest legal price strictly above `rival` — one tick over, for
 * beating a buyer's bid. Unlike `undercutPrice`, no boundary special-case is
 * needed: a band's top value plus its own tick always lands exactly on the
 * next band's floor (e.g. 9,999 + 1 = 10,000), which is legal on either
 * side's grid, so `rival`'s own tick applies everywhere.
 */
export function outbidPrice(rival: number): number | null {
  if (legalOrNull(rival) === null) return null;
  const tickCents = tickCentsForExponent(exponentOf(rival));
  const rivalCents = Math.round(rival * 100);
  return (rivalCents + tickCents) / 100;
}
