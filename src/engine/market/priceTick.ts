const CENTS_EPSILON = 1e-7;

function exponentOf(p: number): number {
  const [, exp] = p.toExponential().split('e');
  return Number(exp);
}

function tickCentsForExponent(e: number): number {
  return e >= 1 ? 10 ** (e - 1) : 1;
}

function legalOrNull(p: number): number | null {
  return Number.isFinite(p) && p > 0 ? p : null;
}

export function priceTick(p: number): number | null {
  if (legalOrNull(p) === null) return null;
  return tickCentsForExponent(exponentOf(p)) / 100;
}

export function roundPriceDown(p: number): number | null {
  if (legalOrNull(p) === null) return null;
  const tickCents = tickCentsForExponent(exponentOf(p));
  const pCents = Math.floor(p * 100 + CENTS_EPSILON);
  if (pCents < 1) return null;
  return (Math.floor(pCents / tickCents) * tickCents) / 100;
}

export function roundPriceUp(p: number): number | null {
  if (legalOrNull(p) === null) return null;
  const tickCents = tickCentsForExponent(exponentOf(p));
  const pCents = Math.max(1, Math.ceil(p * 100 - CENTS_EPSILON));
  return (Math.ceil(pCents / tickCents) * tickCents) / 100;
}

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

export function outbidPrice(rival: number): number | null {
  if (legalOrNull(rival) === null) return null;
  const tickCents = tickCentsForExponent(exponentOf(rival));
  const rivalCents = Math.round(rival * 100);
  return (rivalCents + tickCents) / 100;
}
